import React, { useState, useRef, useEffect } from "react";
import { Paperclip, Globe, Square, Send, ChevronUp, BrainCircuit } from "lucide-react";
import { cn } from "../utils";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  isStreaming: boolean;
  onSend: () => void;
  onStop: () => void;
  isWebSearchMode: boolean;
  setIsWebSearchMode: (value: boolean) => void;
  selectedModelName: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  showToast: (msg: string, type?: 'info'|'success'|'error') => void;
}

export const ChatInput: React.FC<ChatInputProps & { isDeepThinkingMode: boolean; setIsDeepThinkingMode: (val: boolean) => void }> = ({
  input,
  setInput,
  isStreaming,
  onSend,
  onStop,
  isWebSearchMode,
  setIsWebSearchMode,
  selectedModelName,
  textareaRef,
  showToast,
  isDeepThinkingMode,
  setIsDeepThinkingMode,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-zinc-50 via-zinc-50/90 to-transparent dark:from-zinc-950 dark:via-zinc-950/90 dark:to-transparent pt-12 pb-4 md:pb-6 px-3 md:px-4 z-20 pointer-events-none">
      <div className="max-w-3xl mx-auto relative pointer-events-auto w-full">
        <div className="relative">
          {/* Secondary Tool Menu Container */}
          <div className="absolute bottom-full left-2 mb-2 flex flex-col-reverse items-start gap-2 z-10" ref={menuRef}>
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center justify-center p-1.5 rounded-full bg-black/10 dark:bg-white/10 opacity-60 hover:opacity-100 transition-all outline-none backdrop-blur-md shadow-sm"
              title="更多功能"
            >
              <ChevronUp className={cn("h-4 w-4 transition-transform duration-300", isMenuOpen ? "rotate-180" : "")} />
            </button>

            <div className={cn(
              "flex items-center gap-2 transition-all duration-300 origin-bottom-left",
              isMenuOpen ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-95 translate-y-2 pointer-events-none"
            )}>
                <button 
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md shadow-sm opacity-90 hover:opacity-100 transition-opacity whitespace-nowrap outline-none"
                  title="上传文件 (敬请期待)"
                  onClick={() => { showToast("上传文件功能开发中..."); setIsMenuOpen(false); }}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>上传文件</span>
                </button>
                <button 
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-opacity outline-none whitespace-nowrap backdrop-blur-md shadow-sm", 
                    isDeepThinkingMode ? "bg-amber-100/90 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 opacity-100" : "bg-white/80 dark:bg-zinc-800/80 opacity-90 hover:opacity-100"
                  )}
                  title="开启深度思考"
                  onClick={() => {
                    setIsDeepThinkingMode(!isDeepThinkingMode);
                    showToast(isDeepThinkingMode ? "已关闭深度思考" : "已开启深度思考", "info");
                  }}
                >
                  {isDeepThinkingMode ? <BrainCircuit className="h-3.5 w-3.5 animate-pulse" /> : <div className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />}
                  <span>深度思考</span>
                </button>
            </div>
          </div>

          <div className="relative flex items-end gap-2 glass-panel rounded-[24px] p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.05)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.6)] focus-within:border-black/20 dark:focus-within:border-white/30 transition-all duration-300 bg-white/50 dark:bg-black/50">
          
          <button 
            onClick={() => {
              setIsWebSearchMode(!isWebSearchMode);
              showToast(isWebSearchMode ? '已关闭联网搜索' : '已开启实时联网搜索', isWebSearchMode ? 'info' : 'success');
            }} 
            className={cn("p-2.5 rounded-full flex-shrink-0 active:scale-95 transition-all outline-none", isWebSearchMode ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "opacity-50 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10")} 
            title="开启联网搜索"
          >
            <Globe className="h-[22px] w-[22px]" />
          </button>

          <textarea 
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={1}
            placeholder={`给 ${selectedModelName} 发送消息...`}
            className="w-full max-h-[120px] md:max-h-[200px] bg-transparent border-none focus:ring-0 resize-none py-3 placeholder:opacity-50 text-[15px] md:text-base leading-relaxed overflow-y-auto focus:outline-none"
            style={{ minHeight: "48px" }}
          />
          
          {isStreaming ? (
            <button 
              onClick={onStop}
              className="p-2.5 md:p-3 rounded-full transition-all flex-shrink-0 text-white bg-black dark:bg-white dark:text-black shadow-sm mb-0.5 mr-0.5 active:scale-95 hover:scale-105 outline-none flex items-center justify-center animate-pulse"
              title="停止生成"
            >
              <Square className="h-[20px] w-[20px] fill-current" />
            </button>
          ) : (
            <button 
              onClick={onSend}
              disabled={!input.trim()}
              className="p-2.5 md:p-3 rounded-full transition-all flex-shrink-0 text-white disabled:bg-black/10 dark:disabled:bg-white/10 dark:disabled:text-white/30 disabled:text-black/30 bg-black dark:bg-white dark:text-black shadow-sm disabled:shadow-none mb-0.5 mr-0.5 active:scale-95 hover:scale-105 disabled:transform-none disabled:cursor-not-allowed outline-none flex items-center justify-center"
            >
              <Send className="h-[20px] w-[20px] -ml-0.5 mt-0.5" />
            </button>
          )}
        </div>
        <div className="text-center mt-3 text-[10px] md:text-[11px] opacity-50 font-medium">
          AI 内容可能会产生错误，请注意核查。
        </div>
        </div>
      </div>
    </div>
  );
};
