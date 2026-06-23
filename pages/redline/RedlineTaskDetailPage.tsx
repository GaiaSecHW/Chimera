import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { redlineVerificationApi, RedlineTask } from '../../clients/redlineVerification';
import { PageHeader } from '../../design-system';
import { TaskConfigStep } from './components/TaskConfigStep';
import { TaskRunningStep } from './components/TaskRunningStep';
import { TaskReportStep } from './components/TaskReportStep';

interface Props {
  projectId: string;
  taskId: string;
  onBack: () => void;
}

const STEPS = [
  { key: 'config', label: '任务配置' },
  { key: 'running', label: '执行监控' },
  { key: 'report', label: '结果报告' },
];

function getStepFromStatus(task: RedlineTask): number {
  switch (task.status) {
    case 'COMPLETED':
      return task.execSuccess ? 2 : 1;
    case 'EXECUTING':
      return 1;
    default:
      return 0;
  }
}

export const RedlineTaskDetailPage: React.FC<Props> = ({ projectId, taskId, onBack }) => {
  const [task, setTask] = useState<RedlineTask | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  const fetchTask = useCallback(async () => {
    try {
      const res = await redlineVerificationApi.getTask(taskId);
      if (res.code === 200 && res.data) {
        setTask(res.data);
        if (!initialLoadDone.current) {
          setCurrentStep(getStepFromStatus(res.data));
          initialLoadDone.current = true;
        }
      }
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-theme-text-secondary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={task?.name || '任务详情'}
        back={{ onClick: onBack }}
        actions={<div className="flex items-center gap-2">
          {STEPS.map((step, i) => (
            <React.Fragment key={step.key}>
              {i > 0 && <div className={`w-8 h-px ${i <= currentStep ? 'bg-blue-500' : 'bg-theme-border'}`} />}
              <div className="flex items-center gap-1.5">
                {i < currentStep ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : i === currentStep ? (
                  <Circle className="w-4 h-4 text-blue-500 fill-blue-500" />
                ) : (
                  <Circle className="w-4 h-4 text-theme-text-tertiary" />
                )}
                <span className={`text-xs ${i === currentStep ? 'text-blue-500 font-medium' : 'text-theme-text-tertiary'}`}>
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>}
      />

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        {currentStep === 0 && task && (
          <TaskConfigStep
            taskId={taskId}
            task={task}
            onTaskUpdated={fetchTask}
            onNext={() => setCurrentStep(1)}
          />
        )}
        {currentStep === 1 && task && (
          <TaskRunningStep
            taskId={taskId}
            task={task}
            onTaskUpdated={fetchTask}
            onNext={() => setCurrentStep(2)}
            onPrev={() => setCurrentStep(0)}
          />
        )}
        {currentStep === 2 && task && (
          <TaskReportStep
            taskId={taskId}
            task={task}
            onTaskUpdated={fetchTask}
            onPrev={() => setCurrentStep(1)}
          />
        )}
      </div>
    </div>
  );
};