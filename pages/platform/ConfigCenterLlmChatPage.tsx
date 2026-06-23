import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import { PageHeader } from '../../design-system';
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
    <div className="px-5 py-5 md:px-6 2xl:px-8 space-y-4 animate-in fade-in duration-500">
      <PageHeader
        title={<><MessageSquare className="h-8 w-8 text-blue-400 inline" /> LLM 在线聊天</>}
        description="基于已保存的 LLM Provider 进行模型选择、多轮对话与并排对比。"
        back={{ label: '返回 LLM 对接配置', onClick: onBack }}
      />

      {loading ? (
        <div className="rounded-xl border border-theme-border bg-theme-surface px-6 py-16 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-theme-text-muted" />
          <p className="mt-4 text-sm font-medium text-theme-text-secondary">正在加载可用的 LLM Provider...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/15 px-5 py-4 text-sm font-bold text-red-400">
          {error}
        </div>
      ) : (
        <LlmProviderChatWorkspace providers={providers} />
      )}
    </div>
  );
};
