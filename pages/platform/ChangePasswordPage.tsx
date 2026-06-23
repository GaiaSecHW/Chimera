import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api } from '../../clients/api';
import { showAlert } from '../../components/DialogService';
import { UserInfo } from '../../types/types';

interface ChangePasswordPageProps {
  user?: UserInfo | null;
}

interface PasswordRule {
  label: string;
  passed: boolean;
}

export const ChangePasswordPage: React.FC<ChangePasswordPageProps> = ({ user }) => {
  const platformApi = api.domains.platform;
  const [formData, setFormData] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [showField, setShowField] = useState({
    old_password: false,
    new_password: false,
    confirm_password: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const rules = useMemo<PasswordRule[]>(() => {
    const nextPassword = formData.new_password;
    return [
      { label: '至少 10 位字符', passed: nextPassword.length >= 10 },
      { label: '包含大写字母', passed: /[A-Z]/.test(nextPassword) },
      { label: '包含小写字母', passed: /[a-z]/.test(nextPassword) },
      { label: '包含数字', passed: /\d/.test(nextPassword) },
      { label: '包含特殊字符', passed: /[^A-Za-z0-9]/.test(nextPassword) },
      { label: '不能与当前密码相同', passed: !!nextPassword && nextPassword !== formData.old_password },
    ];
  }, [formData.new_password, formData.old_password]);

  const passedRules = rules.filter((rule) => rule.passed).length;
  const strengthLevel = formData.new_password
    ? passedRules <= 2
      ? 'weak'
      : passedRules <= 4
        ? 'medium'
        : 'strong'
    : 'empty';

  const strengthMeta = {
    empty: {
      label: '等待输入',
      accent: 'bg-slate-300',
      panel: 'border-theme-border bg-theme-elevated text-theme-text-muted',
    },
    weak: {
      label: '强度偏弱',
      accent: 'bg-rose-500',
      panel: 'border-rose-500/20 bg-rose-500/15 text-rose-400',
    },
    medium: {
      label: '强度中等',
      accent: 'bg-amber-500',
      panel: 'border-amber-500/20 bg-amber-500/15 text-amber-400',
    },
    strong: {
      label: '强度优秀',
      accent: 'bg-emerald-500',
      panel: 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400',
    },
  } as const;

  const validateForm = () => {
    if (!formData.old_password || !formData.new_password || !formData.confirm_password) {
      return '请完整填写当前密码、新密码和确认密码。';
    }
    if (formData.new_password !== formData.confirm_password) {
      return '两次输入的新密码不一致，请重新确认。';
    }
    if (formData.old_password === formData.new_password) {
      return '新密码不能与当前密码相同。';
    }
    if (passedRules < 5) {
      return '新密码强度还不够，建议至少满足 5 条安全规则。';
    }
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await platformApi.auth.changeOwnPassword({
        old_password: formData.old_password,
        new_password: formData.new_password,
      });
      setFormData({ old_password: '', new_password: '', confirm_password: '' });
      setSuccessMessage(response?.message || '密码修改成功，后续登录请使用新密码。');
      await showAlert({
        title: '密码已更新',
        message: response?.message || '修改密码流程已完成。',
        tone: 'success',
      });
    } catch (err: any) {
      setError(String(err?.message || '修改密码失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const strengthBars = [0, 1, 2, 3];
  const activeBars = strengthLevel === 'empty' ? 0 : strengthLevel === 'weak' ? 1 : strengthLevel === 'medium' ? 2 : 4;

  const renderPasswordField = (
    key: 'old_password' | 'new_password' | 'confirm_password',
    label: string,
    placeholder: string,
  ) => (
    <label className="block">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-theme-text-muted">{label}</span>
        {key === 'new_password' ? (
          <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${strengthMeta[strengthLevel].panel}`}>
            {strengthMeta[strengthLevel].label}
          </span>
        ) : null}
      </div>
 <div className="group flex items-center gap-3 rounded-xl border border-theme-border bg-theme-surface px-5 py-4 transition-all focus-within:border-sky-300 focus-within:">
        <LockKeyhole className="h-5 w-5 text-theme-text-muted transition-colors group-focus-within:text-sky-500" />
        <input
          type={showField[key] ? 'text' : 'password'}
          value={formData[key]}
          onChange={(event) => setFormData((current) => ({ ...current, [key]: event.target.value }))}
          placeholder={placeholder}
          autoComplete={key === 'old_password' ? 'current-password' : 'new-password'}
          className="form-input min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => setShowField((current) => ({ ...current, [key]: !current[key] }))}
          className="rounded-full p-2 text-theme-text-muted transition-colors hover:bg-theme-elevated hover:text-theme-text-secondary"
          aria-label={showField[key] ? '隐藏密码' : '显示密码'}
        >
          {showField[key] ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );

  return (
    <div className="min-h-full bg-theme-app px-6 py-8 xl:px-10">
      <div className="mx-auto max-w-3xl">
 <section className="rounded-xl border border-theme-border bg-theme-surface p-8 backdrop-blur xl:p-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/15 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-400">
                <ShieldCheck size={14} />
                Password Center
              </div>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-theme-text-primary">修改登录密码</h2>
              <p className="mt-3 text-sm leading-7 text-theme-text-muted">
                当前账号：<span className="font-semibold text-theme-text-secondary">{user?.username || '当前账号'}</span>。提交前会先做前端校验，通过后将直接调用后端修改密码接口。
              </p>
            </div>
            <div className="hidden rounded-xl border border-theme-border bg-theme-surface px-4 py-3 text-right lg:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-theme-text-muted">Rule Score</p>
              <p className="mt-1 text-2xl font-bold text-theme-text-primary">{passedRules}/{rules.length}</p>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-theme-border bg-theme-elevated p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-theme-text-primary">密码强度趋势</p>
                <p className="mt-1 text-sm text-theme-text-muted">达到 5 条以上建议后，再提交体验会更顺畅。</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${strengthMeta[strengthLevel].panel}`}>
                {strengthMeta[strengthLevel].label}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-3">
              {strengthBars.map((index) => (
                <div
                  key={index}
                  className={`h-2 rounded-full transition-all ${index < activeBars ? strengthMeta[strengthLevel].accent : 'bg-theme-elevated'}`}
                />
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {renderPasswordField('old_password', '当前密码', '请输入当前密码')}
            {renderPasswordField('new_password', '新密码', '建议使用更长且更复杂的新密码')}
            {renderPasswordField('confirm_password', '确认新密码', '请再次输入新密码')}

            {error ? (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-5 py-4 text-sm font-semibold leading-6 text-rose-400">
                {error}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/15 px-5 py-4 text-sm font-semibold leading-6 text-emerald-400">
                {successMessage}
              </div>
            ) : null}

            <div className="rounded-xl border border-theme-border bg-theme-elevated p-5">
              <p className="text-sm font-semibold text-theme-text-primary">安全规则检查</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {rules.map((rule) => (
                  <div
                    key={rule.label}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${
                      rule.passed
                        ? 'border-emerald-500/20 bg-emerald-500/15 text-emerald-400'
                        : 'border-theme-border bg-theme-elevated text-theme-text-muted'
                    }`}
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full ${rule.passed ? 'bg-emerald-500 text-white' : 'bg-theme-elevated text-theme-text-muted'}`}>
                      <Check size={14} />
                    </div>
                    <span>{rule.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="group flex w-full items-center justify-center gap-3 rounded-xl bg-[linear-gradient(135deg,#0ea5e9_0%,#2563eb_55%,#0f172a_100%)] px-6 py-4 text-sm font-medium text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {submitting ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
              {submitting ? '正在提交修改请求...' : '提交修改密码请求'}
              {!submitting ? <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" /> : null}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
