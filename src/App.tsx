/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Phone, 
  Camera, 
  MapPin, 
  Sprout, 
  User, 
  Bot, 
  Loader2, 
  ChevronRight,
  Info,
  AlertTriangle,
  Leaf,
  X,
  Image as ImageIcon,
  ShoppingBag,
  Calendar,
  FileText,
  HelpCircle,
  Bug,
  Apple,
  Bird,
  PawPrint,
  Droplets,
  Settings,
  Check,
  Search,
  Download
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { chatWithGemini, generatePlantImage, analyzePlantImage } from './lib/gemini';
import { trackUser, getInstallCount, getActiveUserCount } from './lib/firebase';
import { cn } from './lib/utils';

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  timestamp: Date;
  imageUrl?: string;
  isUserUploaded?: boolean;
}

const THEME_COLORS = [
  { name: 'Lục bảo (Mặc định)', value: 'emerald', hex: '#047857' },
  { name: 'Xanh dương', value: 'blue', hex: '#1d4ed8' },
  { name: 'Cam đất', value: 'orange', hex: '#c2410c' },
  { name: 'Chàm', value: 'indigo', hex: '#4338ca' },
  { name: 'Xám trung tính', value: 'slate', hex: '#334155' },
];

const FONT_SIZES = [
  { name: 'Nhỏ', value: 'text-sm', label: '14px' },
  { name: 'Vừa', value: 'text-base', label: '16px' },
  { name: 'Lớn', value: 'text-lg', label: '18px' },
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'bot',
      text: 'Chào bà con! Bà con cần hỗ trợ gì về cây trồng, vật nuôi hay sâu bệnh? Hãy hỏi chuyên gia ngay tại đây.',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Theme State
  const [themeColor, setThemeColor] = useState('emerald');
  const [fontSize, setFontSize] = useState('text-sm');

  // Stats State
  const [stats, setStats] = useState({ installs: 0, active: 0 });

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Firebase tracking & stats
  useEffect(() => {
    // Check URL parameters
    const params = new URLSearchParams(window.location.search);
    const isExpertScreen = params.get('screen') === 'expert';

    // Focus input on mount to reduce steps
    // For older users, focusing automatically is helpful
    if (isExpertScreen || window.innerWidth > 768) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 500);
    }
    
    const initTracking = async () => {
      await trackUser();
      const [installs, active] = await Promise.all([
        getInstallCount(),
        getActiveUserCount()
      ]);
      setStats({ installs, active });
    };

    initTracking();
    
    // Refresh stats and update tracking every 30 seconds
    const interval = setInterval(async () => {
      // Periodic tracking update
      trackUser().catch(console.error);
      
      const [installs, active] = await Promise.all([
        getInstallCount(),
        getActiveUserCount()
      ]);
      setStats({ installs, active });
    }, 30000);

    // PWA Install Prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn tệp hình ảnh.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSelectedImage({ base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input || (selectedImage ? "Bà con gửi ảnh bệnh cây trồng nhờ chuyên gia chẩn đoán." : ""),
      timestamp: new Date(),
      imageUrl: selectedImage?.base64,
      isUserUploaded: !!selectedImage,
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    const currentImage = selectedImage;
    
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      let response: string;
      
      if (currentImage) {
        const prompt = currentInput || "Hãy nhận diện loài cây này và cung cấp thông tin chi tiết về đặc điểm, kỹ thuật canh tác.";
        response = await analyzePlantImage(currentImage.base64, currentImage.mimeType, prompt);
      } else {
        const history = messages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        }));
        response = await chatWithGemini(currentInput, history);
      }
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: response || 'Xin lỗi bà con, hệ thống đang gặp chút trục trặc. Bà con vui lòng thử lại hoặc gọi hotline nhé.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: 'Có lỗi xảy ra khi kết nối với chuyên gia. Bà con vui lòng kiểm tra mạng hoặc gọi trực tiếp hotline: 0834.027.818.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateImage = async (context: string) => {
    if (isGeneratingImage) return;
    setIsGeneratingImage(true);
    
    try {
      const imageUrl = await generatePlantImage(context);
      if (imageUrl) {
        const imageMessage: Message = {
          id: Date.now().toString(),
          role: 'bot',
          text: `Đây là hình ảnh minh họa cho: ${context}`,
          imageUrl: imageUrl,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, imageMessage]);
      }
    } catch (error) {
      console.error('Image generation error:', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleQuickAction = (action: string) => {
    if (action === 'call') {
      window.location.href = 'tel:0834027818';
    } else if (action.startsWith('gen_img:')) {
      const prompt = action.replace('gen_img:', '');
      handleGenerateImage(prompt);
    } else {
      setInput(action);
    }
  };

  const getTheme = () => {
    const themes: Record<string, { 
      header: string, 
      text: string, 
      bg: string, 
      ring: string, 
      prose: string,
      icon: string
    }> = {
      emerald: { 
        header: "bg-emerald-700", 
        text: "text-emerald-700", 
        bg: "bg-emerald-600", 
        ring: "focus:ring-emerald-500", 
        prose: "prose-emerald",
        icon: "text-emerald-600"
      },
      blue: { 
        header: "bg-blue-700", 
        text: "text-blue-700", 
        bg: "bg-blue-600", 
        ring: "focus:ring-blue-500", 
        prose: "prose-blue",
        icon: "text-blue-600"
      },
      orange: { 
        header: "bg-orange-700", 
        text: "text-orange-700", 
        bg: "bg-orange-600", 
        ring: "focus:ring-orange-500", 
        prose: "prose-orange",
        icon: "text-orange-600"
      },
      indigo: { 
        header: "bg-indigo-700", 
        text: "text-indigo-700", 
        bg: "bg-indigo-600", 
        ring: "focus:ring-indigo-500", 
        prose: "prose-indigo",
        icon: "text-indigo-600"
      },
      slate: { 
        header: "bg-slate-700", 
        text: "text-slate-700", 
        bg: "bg-slate-600", 
        ring: "focus:ring-slate-500", 
        prose: "prose-slate",
        icon: "text-slate-600"
      },
    };
    return themes[themeColor] || themes.emerald;
  };

  const currentTheme = getTheme();

  return (
    <div className={cn("flex flex-col h-screen bg-slate-50 font-sans text-slate-900", fontSize)}>
      {/* Header */}
      <header className={cn(currentTheme.header, "text-white p-4 shadow-md flex items-center justify-between sticky top-0 z-10")}>
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-full shadow-sm">
            <Sprout className={cn(currentTheme.text, "w-6 h-6")} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Nông Nghiệp Bát Xát</h1>
            <div className="flex items-center gap-2">
              <p className="text-[10px] opacity-80">Trung tâm Dịch vụ Tổng hợp</p>
              <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-black/20 rounded-full text-[9px] font-bold">
                <span className="flex items-center gap-0.5" title="Số người cài đặt">
                  <User className="w-2.5 h-2.5" /> {stats.installs}
                </span>
                <span className="w-px h-2 bg-white/30" />
                <span className="flex items-center gap-0.5" title="Số người đang sử dụng">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> {stats.active}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-black/10 rounded-full transition-colors"
            title="Cài đặt giao diện"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button 
            onClick={() => handleQuickAction('call')}
            className="p-2 hover:bg-black/10 rounded-full transition-colors"
            title="Gọi hỗ trợ"
          >
            <Phone className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "flex w-full max-w-[85%] flex-col gap-1",
                msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                {msg.role === 'bot' ? (
                  <>
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-emerald-700" />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Chuyên gia</span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Bà con</span>
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-700" />
                    </div>
                  </>
                )}
              </div>
              
              <div className={cn(
                "px-4 py-3 rounded-2xl shadow-sm border overflow-hidden",
                msg.role === 'user' 
                  ? cn(currentTheme.bg, "text-white border-transparent rounded-tr-none") 
                  : "bg-white text-slate-800 border-slate-200 rounded-tl-none"
              )}>
                {msg.imageUrl && (
                  <div className="mb-3 -mx-4 -mt-3">
                    <img 
                      src={msg.imageUrl} 
                      alt="Minh họa" 
                      className="w-full h-auto object-cover max-h-64"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <div className={cn("prose prose-sm max-w-none", currentTheme.prose)}>
                  <ReactMarkdown 
                    components={{
                      p: ({ children }) => {
                        const text = React.Children.toArray(children).join('');
                        
                        // Check if this paragraph contains any buttons in [ ]
                        const buttonRegex = /\[([^\]]+)\]/g;
                        const matches = [...text.matchAll(buttonRegex)];
                        
                        if (matches.length > 0) {
                          return (
                            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
                              {matches.map((match, idx) => {
                                const fullText = match[1];
                                const icon = fullText.split(' ')[0];
                                const label = fullText.substring(icon.length).trim();
                                
                                let IconComponent = HelpCircle;
                                let colorClass = "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100";
                                let action = () => setInput(label);

                                if (icon.includes('📞')) {
                                  IconComponent = Phone;
                                  colorClass = "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100";
                                  action = () => handleQuickAction('call');
                                } else if (icon.includes('📸')) {
                                  IconComponent = Camera;
                                  colorClass = "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100";
                                  action = () => fileInputRef.current?.click();
                                } else if (icon.includes('📍')) {
                                  IconComponent = MapPin;
                                  colorClass = "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100";
                                } else if (icon.includes('🖼️')) {
                                  IconComponent = ImageIcon;
                                  colorClass = "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100";
                                  const prompt = label.replace('Xem hình ảnh minh họa cho ', '');
                                  action = () => handleQuickAction(`gen_img:${prompt}`);
                                } else if (icon.includes('💊')) {
                                  IconComponent = ShoppingBag;
                                  colorClass = "bg-red-50 text-red-700 border-red-200 hover:bg-red-100";
                                } else if (icon.includes('📅')) {
                                  IconComponent = Calendar;
                                  colorClass = "bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100";
                                } else if (icon.includes('📝')) {
                                  IconComponent = FileText;
                                  colorClass = "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100";
                                } else if (icon.includes('❓')) {
                                  IconComponent = HelpCircle;
                                  colorClass = "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100";
                                }

                                return (
                                  <button 
                                    key={idx}
                                    onClick={action}
                                    disabled={isGeneratingImage && icon.includes('🖼️')}
                                    className={cn(
                                      "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm font-medium shadow-sm",
                                      colorClass,
                                      isGeneratingImage && icon.includes('🖼️') && "opacity-50"
                                    )}
                                  >
                                    {isGeneratingImage && icon.includes('🖼️') ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <IconComponent className="w-4 h-4 shrink-0" />
                                    )}
                                    <span className="truncate">{label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        }
                        return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
                      }
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 px-1">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-slate-400 italic text-sm"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            Chuyên gia đang nghiên cứu giải pháp...
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-20 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)]">
        <div className="max-w-4xl mx-auto">
          {/* Quick Suggestions */}
          {messages.length === 1 && !input && (
            <div className="flex gap-2 mb-5 overflow-x-auto pb-2 no-scrollbar px-1">
              {[
                { text: "Cách trị sâu xanh hại lúa?", color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 shadow-emerald-100", icon: Sprout },
                { text: "Kỹ thuật chăm sóc cây dưa hấu", color: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 shadow-rose-100", icon: Droplets },
                { text: "Kỹ thuật chăm sóc cây Lê", color: "bg-lime-50 text-lime-700 border-lime-200 hover:bg-lime-100 shadow-lime-100", icon: Apple },
                { text: "Chăn nuôi Lợn đen bản địa", color: "bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100 shadow-pink-100", icon: PawPrint },
                { text: "Kỹ thuật chăn nuôi gà", color: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 shadow-amber-100", icon: Bird },
                { text: "Kỹ thuật bón phân cho ngô", color: "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100 shadow-yellow-100", icon: Leaf }
              ].map((item) => (
                <button
                  key={item.text}
                  onClick={() => setInput(item.text)}
                  className={cn(
                    "whitespace-nowrap px-5 py-2.5 border rounded-full font-semibold transition-all shadow-md flex items-center gap-2 shrink-0 active:scale-95",
                    item.color,
                    fontSize === 'text-sm' ? 'text-xs' : 'text-sm'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.text}
                </button>
              ))}
            </div>
          )}

          {/* Image Preview */}
          {selectedImage && (
            <div className="mb-5 flex flex-col gap-3">
              <div className="relative inline-block w-28 h-28">
                <img 
                  src={selectedImage.base64} 
                  alt="Xem trước" 
                  className={cn("w-full h-full object-cover rounded-2xl border-4 shadow-xl", "border-" + themeColor + "-500")}
                />
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-2 shadow-lg hover:bg-red-600 transition-colors z-10 border-2 border-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                <button
                  onClick={() => setInput("Đây là cây gì? Hãy nhận diện và cho tôi biết kỹ thuật chăm sóc.")}
                  className={cn(
                    "whitespace-nowrap px-5 py-3 rounded-2xl text-sm font-bold border transition-all shadow-md flex items-center gap-2 active:scale-95",
                    "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  )}
                >
                  <Search className="w-5 h-5" />
                  Nhận diện loài cây
                </button>
                <button
                  onClick={() => setInput("Cây này đang bị bệnh gì? Hãy chẩn đoán và hướng dẫn cách điều trị.")}
                  className={cn(
                    "whitespace-nowrap px-5 py-3 rounded-2xl text-sm font-bold border transition-all shadow-md flex items-center gap-2 active:scale-95",
                    "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                  )}
                >
                  <Bug className="w-5 h-5" />
                  Chẩn đoán bệnh
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSend} className="relative flex items-center gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageSelect} 
              accept="image/*" 
              className="hidden" 
            />
            <div className="relative flex-1 group">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={selectedImage ? "Thêm mô tả về ảnh..." : "Hỏi chuyên gia tại đây..."}
                className={cn(
                  "w-full pl-5 pr-14 py-4 bg-slate-100 border-2 border-transparent rounded-3xl focus:ring-4 focus:bg-white transition-all outline-none shadow-inner",
                  currentTheme.ring.replace('focus:ring-', 'focus:ring-').replace('focus:ring-', 'focus:border-'),
                  fontSize === 'text-sm' ? 'text-base' : 'text-lg'
                )}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all",
                  selectedImage ? currentTheme.text + " bg-white shadow-sm" : "text-slate-400 hover:bg-slate-200"
                )}
                title="Đính kèm ảnh"
              >
                <Camera className="w-6 h-6" />
              </button>
            </div>
            <button
              type="submit"
              disabled={(!input.trim() && !selectedImage) || isLoading}
              className={cn(
                "p-4 rounded-3xl transition-all shadow-xl active:scale-90",
                (input.trim() || selectedImage) && !isLoading
                  ? cn(currentTheme.bg, "text-white hover:opacity-90 shadow-lg")
                  : "bg-slate-200 text-slate-400 shadow-none cursor-not-allowed"
              )}
            >
              <Send className="w-7 h-7" />
            </button>
          </form>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className={cn(currentTheme.header, "p-6 text-white flex justify-between items-center")}>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Settings className="w-6 h-6" /> Cài đặt giao diện
                </h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-8">
                {/* Color Selection */}
                <section>
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Màu sắc chủ đạo</h3>
                  <div className="grid grid-cols-5 gap-3">
                    {THEME_COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => setThemeColor(color.value)}
                        className={cn(
                          "w-full aspect-square rounded-2xl border-4 transition-all flex items-center justify-center relative",
                          themeColor === color.value ? "border-slate-900 scale-110 shadow-lg" : "border-transparent hover:scale-105"
                        )}
                        style={{ backgroundColor: color.hex }}
                        title={color.name}
                      >
                        {themeColor === color.value && <Check className="text-white w-6 h-6" />}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Font Size Selection */}
                <section>
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Kích thước chữ</h3>
                  <div className="flex gap-3">
                    {FONT_SIZES.map((size) => (
                      <button
                        key={size.value}
                        onClick={() => setFontSize(size.value)}
                        className={cn(
                          "flex-1 py-3 px-4 rounded-2xl border-2 transition-all font-medium text-center",
                          fontSize === size.value 
                            ? cn("border-" + themeColor + "-500", currentTheme.text, "bg-slate-50") 
                            : "border-slate-200 text-slate-500 hover:border-slate-300"
                        )}
                      >
                        <div className={size.value}>{size.name}</div>
                        <div className="text-[10px] opacity-60">{size.label}</div>
                      </button>
                    ))}
                  </div>
                </section>

                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className={cn(
                    "w-full py-4 rounded-2xl text-white font-bold shadow-lg transition-all active:scale-95 mb-4",
                    currentTheme.bg
                  )}
                >
                  Hoàn tất
                </button>

                {/* Install App Section */}
                <div className="pt-4 border-t border-slate-100 italic text-[11px] text-slate-400 text-center">
                  {deferredPrompt ? (
                    <button 
                      onClick={handleInstallClick}
                      className={cn("flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 transition-all font-bold text-sm", "border-" + themeColor + "-500", currentTheme.text)}
                    >
                      <Download className="w-4 h-4" /> Cài đặt ứng dụng vào màn hình chính
                    </button>
                  ) : (
                    <div>
                      <p className="mb-2">Để tiện truy cập, hãy chọn "Thêm vào màn hình chính" từ menu trình duyệt của bà con.</p>
                      <div className="flex justify-center gap-4 text-[10px]">
                        <span>iPhone: Nhấn <span className="font-bold">Chia sẻ</span> → <span className="font-bold">Thêm vào MH chính</span></span>
                        <span>Android: Nhấn <span className="font-bold">Ba chấm</span> → <span className="font-bold">Cài đặt ứng dụng</span></span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Action Buttons for Mobile/Quick Access */}
      <div className="fixed right-4 bottom-24 flex flex-col gap-3 z-10">
        <button 
          onClick={() => handleQuickAction('call')}
          className={cn("w-12 h-12 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-transform", currentTheme.bg)}
          title="Gọi hỗ trợ"
        >
          <Phone className="w-6 h-6" />
        </button>
      </div>

      {/* Background Decoration */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0">
        <Leaf className="absolute top-20 left-10 w-40 h-40 rotate-45" />
        <Leaf className="absolute bottom-40 right-10 w-60 h-60 -rotate-12" />
      </div>
    </div>
  );
}
