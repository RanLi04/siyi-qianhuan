import React, { useState, useEffect } from "react";
import { Lightbulb, ChevronDown } from "lucide-react";
import { cn } from "../utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

export const ThinkingBlock = React.memo(function MessageContent({ text, isStreaming, isLast, supportsThinking, isWebSearch }: { text: string, isStreaming: boolean, isLast: boolean, supportsThinking: boolean, isWebSearch?: boolean }) {
  // Normalize alternative thinking tags (e.g., <|channel>thought, <|channel>er_name:, <channel|>)
  const normalizedText = text
    .replace(/<\|channel\|?>[a-zA-Z0-9_:]*/g, "<think>")
    .replace(/<channel\|>/g, "</think>");
  
  const thinkStart = normalizedText.indexOf("<think>");
  const thinkEnd = normalizedText.indexOf("</think>", thinkStart);
  
  const thinkComplete = thinkEnd !== -1;
  const isThinking = isStreaming && isLast && thinkStart !== -1 && !thinkComplete;
  const [isExpanded, setIsExpanded] = useState(false);
  
  useEffect(() => {
    if (isThinking || (isStreaming && !text && isWebSearch)) {
      setIsExpanded(true);
    } else if (thinkComplete && isLast && isStreaming) {
      setIsExpanded(false);
    }
  }, [isThinking, thinkComplete, isLast, isStreaming, isWebSearch, text]);

  let thinkText = "";
  let mainText = normalizedText;
  
  if (thinkStart !== -1) {
    if (thinkComplete) {
      thinkText = normalizedText.substring(thinkStart + 7, thinkEnd).trim();
      mainText = (normalizedText.substring(0, thinkStart) + normalizedText.substring(thinkEnd + 8)).trim();
    } else {
      thinkText = normalizedText.substring(thinkStart + 7).trim();
      mainText = normalizedText.substring(0, thinkStart).trim();
    }
  }

  // Determine if we should show the thinking block. 
  // If it's streaming and we haven't received anything yet, we can pretend it's thinking to give the user peace of mind, IF the model supports thinking natively.
  const showThinkingBlock = thinkStart !== -1 || (isStreaming && !text && (supportsThinking || isWebSearch));
  const isCurrentlyThinking = isThinking || (isStreaming && !text && (supportsThinking || isWebSearch));

  let statusText = "已完成思考";
  if (isCurrentlyThinking) {
      if (thinkStart !== -1) statusText = "Thinking...";
      else if (isWebSearch && !text) statusText = "联网检索中...";
      else statusText = "思考引擎启动中...";
  } else {
      if (thinkStart !== -1) statusText = "Thinking...";
  }

  const defaultThinkMsg = isStreaming && thinkStart === -1 ? (isWebSearch ? "正在执行搜索并提取相关内容，请稍候..." : "等待后端推理系统响应数据...") : "";

  return (
    <div className="flex flex-col gap-2 w-full">
      {showThinkingBlock && (
        <div className="mt-1 mb-1 max-w-full">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 py-1 text-[14px] font-medium opacity-60 hover:opacity-100 transition-opacity"
          >
            <Lightbulb className={cn("h-4 w-4", isCurrentlyThinking ? "text-amber-500 animate-pulse" : "")} />
            <span className="leading-none mt-0.5">{statusText}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300 opacity-60", isExpanded ? "rotate-180" : "")} />
          </button>
          
          {isExpanded && (
            <div className="ml-2 mt-2 pl-4 border-l-2 border-black/10 dark:border-white/10 pb-1 text-[14px] opacity-60 whitespace-normal">
              <div className="whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed">
                {thinkText || defaultThinkMsg}
                {isCurrentlyThinking && <span className="inline-block w-2 h-3 bg-current ml-1 animate-pulse align-middle"></span>}
              </div>
            </div>
          )}
        </div>
      )}
      
      {mainText && (
        <div className="markdown-body prose prose-zinc dark:prose-invert max-w-none prose-p:my-1 prose-p:text-zinc-900 dark:prose-p:text-zinc-100 prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100 prose-pre:bg-black/5 dark:prose-pre:bg-white/10 prose-pre:backdrop-blur-md prose-pre:border-black/5 dark:prose-pre:border-white/5 prose-pre:border overflow-x-hidden pt-1">
           <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {mainText}
           </ReactMarkdown>
        </div>
      )}
      {isStreaming && isLast && !isThinking && (
        <span className={cn(
          "inline-block w-2 h-4 bg-current opacity-50 animate-pulse align-middle",
          mainText ? "-ml-1 mt-2" : ""
        )}></span>
      )}
    </div>
  );
});
