import { useState, useEffect, useRef } from 'react';
import { MessageSquare, MessageSquarePlus, Clock } from 'lucide-react';
import { feedbackApi } from '../../clients/feedback';
import { FeedbackSubmitDialog } from './FeedbackSubmitDialog';
import { FeedbackProgressPanel } from './FeedbackProgressPanel';

export function FeedbackFloatingButton() {
  const [expanded, setExpanded] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const fetchUnread = async () => {
      try {
        const count = await feedbackApi.countUnread();
        if (mounted) setUnreadCount(count);
      } catch {
        // Silent fail — don't bother user with auth errors
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000); // Poll every 60s
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Close expanded state when clicking outside
  useEffect(() => {
    if (!expanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);

  const handleEntryClick = (action: 'submit' | 'progress') => {
    setExpanded(false);
    if (action === 'submit') {
      setSubmitOpen(true);
    } else {
      setProgressOpen(true);
    }
  };

  return (
    <>
      <div ref={containerRef} className="fixed right-4 top-1/2 -translate-y-1/2 z-[70]">
        {!expanded ? (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-theme-surface border border-theme-border shadow-panel hover:shadow-lg transition-shadow"
            title="意见反馈"
          >
            <MessageSquare size={22} className="text-blue-600" />
          </button>
        ) : (
          <div className="w-48 rounded-xl bg-theme-surface border border-theme-border shadow-panel overflow-hidden">
            {/* Entry 1: 意见反馈 */}
            <button
              onClick={() => handleEntryClick('submit')}
              className="w-full flex items-center gap-3 p-3 hover:bg-theme-elevated transition-colors border-b border-theme-border"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <MessageSquarePlus size={18} className="text-blue-500" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-theme-text-primary">意见反馈</div>
                <div className="text-xs text-theme-text-muted">提交新意见</div>
              </div>
            </button>
            {/* Entry 2: 查看进展 */}
            <button
              onClick={() => handleEntryClick('progress')}
              className="w-full flex items-center gap-3 p-3 hover:bg-theme-elevated transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                <Clock size={18} className="text-green-500" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-theme-text-primary">查看进展</div>
                <div className="text-xs text-theme-text-muted">跟踪处理结果</div>
              </div>
              {unreadCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-semibold min-w-[20px] h-5 rounded-full flex items-center justify-center px-1.5">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
      <FeedbackSubmitDialog open={submitOpen} onClose={() => setSubmitOpen(false)} />
      <FeedbackProgressPanel open={progressOpen} onClose={() => setProgressOpen(false)} />
    </>
  );
}
