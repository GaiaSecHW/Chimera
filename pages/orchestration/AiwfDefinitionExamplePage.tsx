import React, { useMemo } from 'react';
import { ArrowLeft, Copy } from 'lucide-react';
import { AiwfPageShell } from './AiwfShared';
import { AiwfWorkflowGraphPreview } from './AiwfWorkflowGraphPreview';

const EXAMPLE_DEFINITION_JSON = `{
  "version": "1.0",
  "global": {
    "workspace_root": "/workspace",
    "log_level": "INFO",
    "max_workflow_retry": 2,
    "max_review_cycles": 3,
    "default_context_reset": false,
    "parallel_result_review": true,
    "env_vars": {}
  },
  "agents": [],
  "plugins": [],
  "workflows": {
    "atomic": [
      {
        "id": "sample_atomic",
        "name": "Sample Atomic Workflow",
        "type": "atomic",
        "description": "",
        "input_task_type": "atomic:sample_atomic:input",
        "output_task_type": "atomic:sample_atomic:output",
        "working_dir_template": "sample_atomic_{task_id}",
        "start_plugins": [],
        "end_plugins": [],
        "engine": {
          "max_review_cycles": 2,
          "max_worker_turns_per_cycle": 5
        },
        "roles": {
          "worker": {
            "agent_id": "",
            "new_session": true,
            "reset_context_override": null,
            "prompts": {
              "work": {
                "system_prompt_file": "prompts/worker_system.md",
                "user_prompt_file": "prompts/worker_user.md"
              },
              "reflection": [],
              "summary": {
                "prompt_file": "prompts/summary.md",
                "output_summary_filename": "summary.md",
                "output_results_dir": "results"
              }
            }
          },
          "advisors": {
            "global_review": [],
            "result_review": []
          }
        }
      }
    ],
    "composite": [
      {
        "id": "sample_pipeline",
        "name": "Sample Pipeline",
        "type": "composite",
        "description": "",
        "working_dir_template": "sample_pipeline_{execution_id}",
        "stages": [
          {
            "stage_id": "stage_01",
            "name": "Stage 01",
            "sequence": 1,
            "workflow_ref": "sample_atomic",
            "workflow_type": "atomic",
            "on_error": "skip_task",
            "description": ""
          }
        ]
      }
    ]
  },
  "execution": {
    "entry_workflow": "sample_pipeline",
    "entry_workflow_type": "composite",
    "input_task": {
      "task_file": "input/task.md",
      "task_id": "sample-task"
    },
    "output_dir": "output",
    "execution_id": "sample-run",
    "runtime_mode": "rest_service",
    "on_completion": {
      "exit_code_on_success": 0,
      "exit_code_on_failure": 1,
      "write_summary": true,
      "summary_file": "output/execution_summary.json"
    }
  }
}`;

export const AiwfDefinitionExamplePage: React.FC<{
  onBack: () => void;
}> = ({ onBack }) => {
  const parsedDefinition = useMemo(() => {
    try {
      return JSON.parse(EXAMPLE_DEFINITION_JSON);
    } catch {
      return null;
    }
  }, []);

  return (
    <AiwfPageShell
      title="AI工作流定义 Example"
      description=""
      actions={
        <button onClick={onBack} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold">
          <ArrowLeft size={16} />
          返回定义列表
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="text-sm font-black text-slate-800">Example JSON</div>
            <button
              onClick={() => void navigator.clipboard.writeText(EXAMPLE_DEFINITION_JSON)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              title="复制 JSON"
            >
              <Copy size={13} />
              复制
            </button>
          </div>
          <pre className="w-full min-h-[360px] whitespace-pre-wrap break-words bg-slate-950 text-slate-100 p-4 text-xs leading-6 overflow-auto">
            {EXAMPLE_DEFINITION_JSON}
          </pre>
        </div>
        <AiwfWorkflowGraphPreview definitionJson={parsedDefinition} />
      </div>
    </AiwfPageShell>
  );
};
