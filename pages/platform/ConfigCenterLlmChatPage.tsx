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
          <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-slate-900">
            <MessageSquare className="h-8 w-8 text-blue-600" />
            LLM 在线聊天
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            基于已保存的 LLM Provider 进行模型选择、多轮对话与并排对比。
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600"
        >
          <ArrowLeft size={16} />
          返回 LLM 对接配置
        </button>
      </div>

      {loading ? (
        <div className="rounded-[2.5rem] border border-slate-200 bg-white px-6 py-16 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
          <p className="mt-4 text-sm font-black text-slate-600">正在加载可用的 LLM Provider...</p>
        </div>
      ) : error ? (
        <div className="rounded-[2rem] border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-600">
          {error}
        </div>
      ) : (
        <LlmProviderChatWorkspace providers={providers} />
      )}
    </div>
  );
};
