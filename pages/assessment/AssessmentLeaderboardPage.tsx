import React, { useEffect, useRef } from 'react';
import './leaderboard-ui/style.css';

interface AssessmentLeaderboardPageProps {
  projectId?: string;
}

export const AssessmentLeaderboardPage: React.FC<AssessmentLeaderboardPageProps> = ({ projectId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const leaderboardRef = useRef<any>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let mounted = true;

    const init = async () => {
      try {
        const mod = await import('./leaderboard-ui/leaderboard.js');
        if (!mounted) return;
        leaderboardRef.current = mod;
        await mod.initLeaderboard(container, {
          apiPrefix: '/api/ai4secbench-leaderboard',
        });
      } catch (err) {
        if (mounted) {
          const root = container.querySelector('[data-lb-root]');
          if (root) {
            root.innerHTML = `<section class="lb-page-section"><div class="lb-status error">加载排行榜组件失败</div></section>`;
          }
        }
      }
    };

    init();

    return () => {
      mounted = false;
      if (leaderboardRef.current) {
        leaderboardRef.current.destroyLeaderboard();
        leaderboardRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="lb-leaderboard-mount">
      {/* Stat cards */}
      <div className="lb-stat-row">
        <div className="lb-stat-card">
          <span className="lb-stat-label">参与 Agent</span>
          <span className="lb-stat-value" data-lb-stat="agents">—</span>
        </div>
        <div className="lb-stat-card">
          <span className="lb-stat-label">任务总数</span>
          <span className="lb-stat-value" data-lb-stat="tasks">—</span>
        </div>
        <div className="lb-stat-card">
          <span className="lb-stat-label">领域数</span>
          <span className="lb-stat-value" data-lb-stat="domains">—</span>
        </div>
        <div className="lb-stat-card">
          <span className="lb-stat-label">最高均分</span>
          <span className="lb-stat-value" data-lb-stat="topscore">—</span>
        </div>
      </div>

      {/* Leaderboard content root */}
      <div data-lb-root>
        <section className="lb-page-section">
          <div className="lb-status">加载中…</div>
        </section>
      </div>

      {/* Detail modal */}
      <div data-lb-modal className="lb-modal" hidden>
        <div className="lb-modal-card lb-panel">
          <header>
            <h2 data-lb-modal-title></h2>
            <button data-lb-modal-close className="lb-btn-close">×</button>
          </header>
          <div data-lb-modal-body className="lb-modal-body"></div>
        </div>
      </div>

      {/* Footer */}
      <div className="lb-footer">
        <span data-lb-footer></span>
      </div>
    </div>
  );
};
