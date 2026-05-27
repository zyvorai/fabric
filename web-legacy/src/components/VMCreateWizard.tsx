// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState } from 'react';
import { Server, Cpu, HardDrive, Network, CheckCircle } from 'lucide-react';
import { vmApi } from '../utils/api';
import { useViewContext } from '../App';

const STEPS = [
  { label: 'Basic', icon: Server },
  { label: 'Resources', icon: Cpu },
  { label: 'Storage', icon: HardDrive },
  { label: 'Network', icon: Network },
  { label: 'Review', icon: CheckCircle },
];

interface WizardData {
  name: string; image: string; os: string; description: string;
  cpus: number; memory: number; cpu_model: string;
  disk: number; disk_format: string; storage_pool: string;
  network_mode: string; bridge: string; mac_address: string;
}

const INITIAL: WizardData = {
  name: '', image: '', os: 'linux', description: '',
  cpus: 2, memory: 2048, cpu_model: 'host',
  disk: 20, disk_format: 'qcow2', storage_pool: 'default',
  network_mode: 'bridge', bridge: 'virbr0', mac_address: '',
};

export default function VMCreateWizard() {
  const { navigateTo } = useViewContext();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof WizardData, v: string | number) => setData({ ...data, [k]: v });

  const handleCreate = async () => {
    setCreating(true); setError('');
    try {
      await vmApi.create({
        name: data.name.trim(),
        image: data.image,
        cpus: data.cpus,
        memory: data.memory,
        disk: data.disk,
      });
      navigateTo('vmList');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setCreating(false); }
  };

  const Input = ({ label, field, type = 'text', placeholder = '' }: { label: string; field: keyof WizardData; type?: string; placeholder?: string }) => (
    <div>
      <label className="text-xs text-slate-400 block mb-1.5">{label}</label>
      <input type={type} value={data[field]} onChange={e => set(field, type === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
    </div>
  );

  const Select = ({ label, field, options }: { label: string; field: keyof WizardData; options: { value: string; label: string }[] }) => (
    <div>
      <label className="text-xs text-slate-400 block mb-1.5">{label}</label>
      <select value={data[field]} onChange={e => set(field, e.target.value)}
        className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Create Virtual Machine</h1>

      {/* Stepper */}
      <div className="flex items-center justify-between bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const done = i < step;
          return (
            <button key={s.label} onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                active ? 'bg-blue-600 text-white' : done ? 'text-blue-400 hover:bg-slate-700' : 'text-slate-500'
              }`}>
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="VM Name" field="name" placeholder="my-vm" />
              <Input label="Image" field="image" placeholder="ubuntu-24.04.qcow2" />
              <Select label="OS Type" field="os" options={[
                { value: 'linux', label: 'Linux' }, { value: 'windows', label: 'Windows' }, { value: 'other', label: 'Other' },
              ]} />
              <Input label="Description" field="description" placeholder="Optional description" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white">Resources</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="vCPUs" field="cpus" type="number" />
              <Input label="Memory (MB)" field="memory" type="number" />
              <Select label="CPU Model" field="cpu_model" options={[
                { value: 'host', label: 'Host Passthrough' }, { value: 'qemu64', label: 'QEMU64' }, { value: 'max', label: 'Max' },
              ]} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white">Storage</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="Disk Size (GB)" field="disk" type="number" />
              <Select label="Disk Format" field="disk_format" options={[
                { value: 'qcow2', label: 'QCOW2' }, { value: 'raw', label: 'Raw' }, { value: 'vmdk', label: 'VMDK' },
              ]} />
              <Input label="Storage Pool" field="storage_pool" placeholder="default" />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white">Network</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select label="Network Mode" field="network_mode" options={[
                { value: 'bridge', label: 'Bridge' }, { value: 'nat', label: 'NAT' }, { value: 'none', label: 'None' },
              ]} />
              <Input label="Bridge" field="bridge" placeholder="virbr0" />
              <Input label="MAC Address" field="mac_address" placeholder="Auto-generated" />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white">Review Configuration</h3>
            {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">{error}</div>}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {Object.entries(data).filter(([, v]) => v !== '' && v !== 0).map(([k, v]) => (
                <div key={k} className="flex justify-between p-2 bg-slate-900/30 rounded-lg">
                  <span className="text-slate-400">{k.replace(/_/g, ' ')}</span>
                  <span className="text-white font-medium">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
          className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
          Back
        </button>
        {step < 4 ? (
          <button onClick={() => setStep(step + 1)}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            Next
          </button>
        ) : (
          <button onClick={handleCreate} disabled={creating || !data.name}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {creating ? 'Creating...' : 'Create VM'}
          </button>
        )}
      </div>
    </div>
  );
}
