import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { apiUrl } from "@/config";
import { Send, Terminal, Settings2, Database, Cpu, Search, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ToolCall {
  tool_definition: Record<string, any>;
  args: Record<string, any>;
  result: Record<string, any>;
}

interface ChatTurn {
  user_message: string;
  step_1_ai_thinking?: string;
  step_2_tool_call?: ToolCall;
  step_3_rag_context?: string;
  step_4_ai_response?: string;
  error?: boolean;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [kbSize, setKbSize] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(apiUrl("/chat-api/"))
      .then(res => res.json())
      .then(data => setKbSize(data.knowledge_base_size))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    const newTurn: ChatTurn = { user_message: userMessage };
    setMessages(prev => [...prev, newTurn]);

    try {
      const res = await fetch(apiUrl("/chat-api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();
      
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          ...data,
        };
        return copy;
      });
      if (data.knowledge_base_size !== undefined) {
        setKbSize(data.knowledge_base_size);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          error: true,
          step_4_ai_response: "System error: Failed to connect to the pipeline.",
        };
        return copy;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background text-foreground font-mono">
      {/* Header */}
      <header className="flex-none border-b border-border bg-card/50 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-md">
            <Settings2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-foreground uppercase">AI Pipeline Debugger</h1>
            <p className="text-xs text-muted-foreground">RAG & Function Calling Trace</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="bg-secondary text-secondary-foreground border-border font-mono font-normal flex gap-2">
            <Database className="w-3 h-3 text-emerald-400" />
            <span className="opacity-80">Knowledge Base:</span>
            <span className="text-emerald-400 font-bold">{kbSize !== null ? kbSize : "..."} records</span>
          </Badge>
          <Badge variant="outline" className="bg-secondary text-secondary-foreground border-border font-mono font-normal flex gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            System Online
          </Badge>
        </div>
      </header>

      {/* Main Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="max-w-xl text-center space-y-4">
              <Terminal className="w-12 h-12 text-primary mx-auto opacity-80" />
              <h2 className="text-xl font-semibold">Awaiting Input</h2>
              <p className="text-sm text-muted-foreground leading-relaxed font-sans">
                Type any number from 0 to 99 to look up a product from the company database. The system will show you every step of the pipeline: AI reasoning → tool call → RAG retrieval → grounded response.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className="space-y-4 max-w-4xl mx-auto">
              {/* User Input Log */}
              <div className="flex items-start gap-3">
                <div className="mt-1 font-bold text-muted-foreground text-xs select-none">$&gt;</div>
                <div className="text-sm bg-secondary px-3 py-2 rounded-md text-foreground border border-border">
                  {msg.user_message}
                </div>
              </div>

              {/* Pipeline Output */}
              {msg.step_1_ai_thinking ? (
                <div className="pl-6 border-l border-border/50 space-y-4">
                  {/* Step 1: AI Thinking */}
                  <PipelineStep 
                    title="Step 1: AI Reasoning" 
                    icon={<Cpu className="w-4 h-4" />}
                    color="text-amber-400"
                    bgColor="bg-amber-400/10"
                    borderColor="border-amber-400/20"
                  >
                    <div className="text-sm text-amber-200/80 italic font-sans">
                      {msg.step_1_ai_thinking}
                    </div>
                  </PipelineStep>

                  {/* Step 2: Tool Call */}
                  <PipelineStep 
                    title="Step 2: Tool Execution" 
                    icon={<Settings2 className="w-4 h-4" />}
                    color="text-indigo-400"
                    bgColor="bg-indigo-400/10"
                    borderColor="border-indigo-400/20"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-xs text-indigo-400/60 uppercase font-semibold">Invocation Args</div>
                        <pre className="text-xs p-3 bg-black/40 rounded border border-indigo-400/10 overflow-x-auto text-indigo-200">
                          {JSON.stringify(msg.step_2_tool_call?.args, null, 2)}
                        </pre>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs text-indigo-400/60 uppercase font-semibold">Execution Result</div>
                        <pre className="text-xs p-3 bg-black/40 rounded border border-indigo-400/10 overflow-x-auto text-indigo-200">
                          {JSON.stringify(msg.step_2_tool_call?.result, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </PipelineStep>

                  {/* Step 3: RAG Context */}
                  <PipelineStep 
                    title="Step 3: Retrieval (RAG)" 
                    icon={<Search className="w-4 h-4" />}
                    color="text-emerald-400"
                    bgColor="bg-emerald-400/10"
                    borderColor="border-emerald-400/20"
                  >
                    <div className="text-sm text-emerald-200/80 font-sans border-l-2 border-emerald-400/30 pl-3">
                      {msg.step_3_rag_context}
                    </div>
                  </PipelineStep>

                  {/* Step 4: Final Response */}
                  <PipelineStep 
                    title="Step 4: Grounded Generation" 
                    icon={msg.error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    color={msg.error ? "text-destructive" : "text-primary"}
                    bgColor={msg.error ? "bg-destructive/10" : "bg-primary/10"}
                    borderColor={msg.error ? "border-destructive/20" : "border-primary/20"}
                  >
                    <div className="prose prose-sm prose-invert max-w-none text-foreground font-sans">
                      <ReactMarkdown>{msg.step_4_ai_response || ""}</ReactMarkdown>
                    </div>
                  </PipelineStep>
                </div>
              ) : (
                <div className="pl-6 border-l border-border/50">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground animate-pulse">
                    <Cpu className="w-4 h-4" />
                    <span>Processing request through pipeline...</span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input Area */}
      <div className="flex-none p-4 bg-card/80 border-t border-border">
        <div className="max-w-4xl mx-auto relative">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground font-bold">
                $&gt;
              </div>
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Enter a document index (e.g. 42)"
                disabled={isLoading}
                className="pl-10 bg-secondary/50 border-border h-12 font-mono text-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all"
              />
            </div>
            <Button 
              type="submit" 
              disabled={isLoading || !input.trim()}
              className="h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-md font-sans transition-all"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  <span>Running</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Execute</span>
                  <Send className="w-4 h-4" />
                </div>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function PipelineStep({ 
  title, 
  icon, 
  children, 
  color, 
  bgColor, 
  borderColor 
}: { 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}) {
  return (
    <Card className={cn("border-l-4 rounded-r-lg overflow-hidden bg-secondary/30", borderColor)}>
      <div className={cn("px-4 py-2 border-b flex items-center gap-2 text-xs font-bold tracking-wider uppercase", color, bgColor, borderColor)}>
        {icon}
        {title}
      </div>
      <CardContent className="p-4 bg-transparent border-t-0">
        {children}
      </CardContent>
    </Card>
  );
}
