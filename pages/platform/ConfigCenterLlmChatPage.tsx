import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import { api } from '../../clients/api';
import { LlmProviderChatWorkspace } from '../../components/platform/LlmProviderChatWorkspace';
import { LlmProviderSummary } from '../../types/types';

interface ConfigCenterLlmChatPageProps {
  onBack: () => void;
}

export const ConfigCenterLlmChatPage: React.FC<ConfigCenterLlmChatPageProps> = ({ onBack }) => {
  const platformApi = api.domains.platform;
  const [providers, setProviders] = useState<LlmProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadProviders = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await platformApi.configCenter.listLlmProviders();
        if (!active) return;
        setProviders(response.items || []);
      } catch (err: any) {
        if (!active) return;
        setError(err.message || '加载 LLM Provider 失败');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void loadProviders();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-theme-text-primary">
            <MessageSquare className="h-8 w-8 text-blue-400" />
            LLM 在线聊天
          </h1>
          <p className="mt-2 text-sm text-theme-text-muted">
            基于已保存的 LLM Provider 进行模型选择、多轮对话与并排对比。
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3 text-sm font-black text-theme-text-secondary"
        >
          <ArrowLeft size={16} />
          返回 LLM 对接配置
        </button>
      </div>

      {loading ? (
        <div className="rounded-[2.5rem] border border-theme-border bg-theme-bg-app px-6 py-16 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-theme-text-muted" />
          <p className="mt-4 text-sm font-black text-theme-text-secondary">正在加载可用的 LLM Provider...</p>
        </div>
      ) : error ? (
        <div className="rounded-[2rem] border border-red-500/20 bg-red-500/15 px-5 py-4 text-sm font-bold text-red-400">
          {error}
        </div>
      ) : (
        <LlmProviderChatWorkspace providers={providers} />
      )}
    </div>
  );
};
