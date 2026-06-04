import React, { useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Container,
  Database,
  Globe,
  HardDrive,
  Key,
  Lock,
  Network,
  Package,
  RefreshCw,
  Settings,
  Zap
} from 'lucide-react';
import { ParsedCompose, ComposeService, ComposeVolume } from '../types/types';

interface ComposeViewerProps {
  parsedCompose: ParsedCompose;
  isStale?: boolean;
  onRefresh?: () => void;
}

export const ComposeViewer: React.FC<ComposeViewerProps> = ({
  parsedCompose,
  isStale,
  onRefresh
}) => {
  const servicesCount = Object.keys(parsedCompose.services || {}).length;
  const networksCount = Object.keys(parsedCompose.networks || {}).length;
  const volumesCount = Object.keys(parsedCompose.volumes || {}).length;

  return (
    <div className="space-y-8">
      {/* 顶部工具栏 */}
      <div className="bg-theme-surface rounded-[2rem] border border-theme-border p-8 shadow-panel">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-logo-surface rounded-xl flex items-center justify-center text-theme-text-inverse shadow-brand">
              <Container size={28} />
            </div>
            <div>
              <h3 className="text-xl font-black text-theme-text-primary">Docker Compose 配置</h3>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-xs font-black text-brand-primary uppercase">{parsedCompose.version || '3.0'}</span>
                <span className="text-theme-text-faint">|</span>
                <span className="text-xs font-medium text-theme-text-muted">{servicesCount} 服务</span>
                {networksCount > 0 && (
                  <>
                    <span className="text-theme-text-faint">|</span>
                    <span className="text-xs font-medium text-theme-text-muted">{networksCount} 网络</span>
                  </>
                )}
                {volumesCount > 0 && (
                  <>
                    <span className="text-theme-text-faint">|</span>
                    <span className="text-xs font-medium text-theme-text-muted">{volumesCount} 卷</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {isStale && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-2 px-6 py-3 bg-amber-50 text-amber-700 rounded-xl text-sm font-black hover:bg-amber-100 transition-all shadow-panel"
            >
              <RefreshCw size={16} />
              配置已更新，点击刷新
            </button>
          )}
        </div>
      </div>

      {/* Services 展示 */}
      <div>
        <h4 className="text-lg font-black text-theme-text-primary mb-4 flex items-center gap-2">
          <Container size={20} className="text-blue-600" />
          Services ({servicesCount})
        </h4>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(parsedCompose.services || {}).map(([name, service]) => (
            <ServiceCard key={name} name={name} service={service} />
          ))}
        </div>
      </div>

      {/* Networks 展示 */}
      {parsedCompose.networks && Object.keys(parsedCompose.networks).length > 0 && (
        <div>
          <h4 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <Network size={20} className="text-purple-600" />
            Networks ({networksCount})
          </h4>
          <div className="bg-theme-surface rounded-xl border border-theme-border p-6 shadow-panel">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(parsedCompose.networks).map(([name, config]) => (
                <div key={name} className="p-4 bg-theme-elevated rounded-lg border border-theme-border">
                  <div className="font-black text-theme-text-primary mb-1">{name}</div>
                  <div className="text-xs text-theme-text-muted">
                    {(config as any).driver || 'bridge'} driver
                    {(config as any).external && ' (external)'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Volumes 展示 */}
      {parsedCompose.volumes && Object.keys(parsedCompose.volumes).length > 0 && (
        <div>
        <h4 className="text-lg font-black text-theme-text-primary mb-4 flex items-center gap-2">
            <HardDrive size={20} className="text-green-600" />
            Volumes ({volumesCount})
          </h4>
          <div className="bg-theme-surface rounded-xl border border-theme-border p-6 shadow-panel">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(parsedCompose.volumes).map(([name, config]) => (
                <div key={name} className="p-4 bg-theme-elevated rounded-lg border border-theme-border">
                  <div className="font-black text-theme-text-primary mb-1">{name}</div>
                  <div className="text-xs text-theme-text-muted">
                    {(config as any).driver || 'local'} driver
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Configs 展示 */}
      {parsedCompose.configs && Object.keys(parsedCompose.configs).length > 0 && (
        <div>
        <h4 className="text-lg font-black text-theme-text-primary mb-4 flex items-center gap-2">
            <Settings size={20} className="text-orange-600" />
            Configs ({Object.keys(parsedCompose.configs).length})
          </h4>
          <div className="bg-theme-surface rounded-xl border border-theme-border p-6 shadow-panel">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(parsedCompose.configs).map(([name, config]) => (
                <div key={name} className="p-4 bg-theme-elevated rounded-lg border border-theme-border">
                  <div className="font-black text-theme-text-primary mb-1">{name}</div>
                  <div className="text-xs text-theme-text-muted font-mono">
                    {(config as any).file || (config as any).external || 'N/A'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Secrets 展示 */}
      {parsedCompose.secrets && Object.keys(parsedCompose.secrets).length > 0 && (
        <div>
        <h4 className="text-lg font-black text-theme-text-primary mb-4 flex items-center gap-2">
            <Lock size={20} className="text-red-600" />
            Secrets ({Object.keys(parsedCompose.secrets).length})
          </h4>
          <div className="bg-theme-surface rounded-xl border border-theme-border p-6 shadow-panel">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(parsedCompose.secrets).map(([name, secret]) => (
                <div key={name} className="p-4 bg-red-50 rounded-lg border border-red-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Key size={14} className="text-red-600" />
                    <span className="font-black text-theme-text-primary">{name}</span>
                  </div>
                  <div className="text-xs text-theme-text-muted font-mono">
                    {(secret as any).file || (secret as any).external || 'N/A'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ServiceCard 子组件
const ServiceCard: React.FC<{ name: string; service: ComposeService }> = ({ name, service }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-theme-surface rounded-xl border border-theme-border shadow-panel overflow-hidden">
      <div
        className="p-5 cursor-pointer hover:bg-theme-elevated transition-all"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-soft rounded-lg flex items-center justify-center">
              <Container size={20} className="text-brand-primary" />
            </div>
            <div>
              <h5 className="font-black text-theme-text-primary">{name}</h5>
              {service.container_name && (
                <p className="text-xs text-theme-text-faint font-mono">{service.container_name}</p>
              )}
            </div>
          </div>
          {expanded ? (
            <ChevronUp size={20} className="text-theme-text-faint" />
          ) : (
            <ChevronDown size={20} className="text-theme-text-faint" />
          )}
        </div>

        {/* 镜像信息 */}
        {service.image && (
          <div className="flex items-center gap-2 text-sm mb-2">
            <Package size={16} className="text-theme-text-faint" />
            <code className="bg-theme-elevated px-2 py-1 rounded text-theme-text-secondary font-mono text-xs">
              {service.image}
            </code>
          </div>
        )}

        {/* 端口信息 */}
        {service.ports && service.ports.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {service.ports.map((port, idx) => (
              <span
                key={idx}
                className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-mono"
              >
                {port.published}:{port.target}/{port.protocol}
              </span>
            ))}
          </div>
        )}

        {/* 网络信息 */}
        {service.networks && service.networks.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {service.networks.map(net => (
              <span
                key={net}
                className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded"
              >
                {net}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 展开后显示详细信息 */}
      {expanded && (
        <div className="px-5 pb-5 pt-0 border-t border-theme-border space-y-4">
          {/* 环境变量 */}
          {service.environment && Object.keys(service.environment).length > 0 && (
            <EnvVarList envVars={service.environment} />
          )}

          {/* 卷挂载 */}
          {service.volumes && service.volumes.length > 0 && (
            <VolumeMountList volumes={service.volumes} />
          )}

          {/* 依赖关系 */}
          {service.depends_on && service.depends_on.length > 0 && (
            <div>
              <div className="text-xs font-black text-theme-text-muted uppercase mb-2">Depends On</div>
              <div className="flex flex-wrap gap-2">
                {service.depends_on.map(dep => (
                  <span
                    key={dep}
                    className="text-xs bg-theme-elevated text-theme-text-secondary px-2 py-1 rounded"
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Restart 策略 */}
          {service.restart && (
            <div>
              <div className="text-xs font-black text-theme-text-muted uppercase mb-1">Restart Policy</div>
              <div className="text-sm text-theme-text-secondary font-mono">{service.restart}</div>
            </div>
          )}

          {/* Build 配置 */}
          {service.build && (
            <div>
              <div className="text-xs font-black text-theme-text-muted uppercase mb-1">Build</div>
              <div className="text-sm text-theme-text-secondary font-mono">
                {service.build.context}
                {service.build.dockerfile && ` → ${service.build.dockerfile}`}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 环境变量列表
const EnvVarList: React.FC<{ envVars: Record<string, string> }> = ({ envVars }) => (
  <div>
    <div className="text-xs font-black text-theme-text-muted uppercase mb-2">Environment Variables</div>
    <div className="rounded-lg p-4 text-xs font-mono space-y-1 max-h-40 overflow-y-auto" style={{ backgroundColor: 'var(--xterm-bg)' }}>
      {Object.entries(envVars).map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <span className="text-blue-400">{key}</span>
          <span className="text-theme-text-faint">=</span>
          <span className="text-green-400">{value}</span>
        </div>
      ))}
    </div>
  </div>
);

// 卷挂载列表
const VolumeMountList: React.FC<{ volumes: ComposeVolume[] }> = ({ volumes }) => (
  <div>
    <div className="text-xs font-black text-theme-text-muted uppercase mb-2">Volume Mounts</div>
    <div className="space-y-2 max-h-40 overflow-y-auto">
      {volumes.map((vol, idx) => (
        <div key={idx} className="flex items-center gap-3 p-2 bg-theme-elevated rounded-lg text-xs">
          <span
            className={`px-2 py-1 rounded font-black uppercase ${
              vol.type === 'bind'
                ? 'bg-orange-100 text-orange-800'
                : 'bg-blue-100 text-blue-800'
            }`}
          >
            {vol.type}
          </span>
          <code className="font-mono text-theme-text-secondary flex-1 truncate">{vol.source}</code>
          <span className="text-theme-text-faint">→</span>
          <code className="font-mono text-theme-text-secondary flex-1 truncate">{vol.target}</code>
          {vol.read_only && (
            <span className="text-theme-text-faint text-xs">(ro)</span>
          )}
        </div>
      ))}
    </div>
  </div>
);
