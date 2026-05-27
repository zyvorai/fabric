// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, Fragment } from 'react';
import {
  Server, Cpu, HardDrive, CheckCircle, ArrowLeft, ArrowRight, Loader2,
} from 'lucide-react';
import { useViewContext } from '../App';
import { vmApi } from '../utils/api';
import { formatMemory } from '../utils/format';

interface VMConfig {
  name: string;
  image: string;
  cpus: number;
  memory: number;
  disk: number;
}

const STEPS = [
  { label: 'Basic Info', icon: Server },
  { label: 'Resources', icon: Cpu },
  { label: 'Storage', icon: HardDrive },
  { label: 'Review', icon: CheckCircle },
];

export default function CreateVM() {
  const { navigateTo } = useViewContext();
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<VMConfig>({
    name: '',
    image: '',
    cpus: 2,
    memory: 2048,
    disk: 20,
  });

  const updateConfig = <K extends keyof VMConfig>(key: K, value: VMConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const canProceed = (): boolean => {
    if (step === 0) return config.name.trim().length > 0;
    return true;
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await vmApi.create({
        name: config.name.trim(),
        image: config.image,
        cpus: config.cpus,
        memory: config.memory,
        disk: config.disk,
      });
      navigateTo('vmList');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create VM');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigateTo('vmList')}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to VMs
        </button>
        <h1 className="text-2xl font-bold text-white">Create Virtual Machine</h1>
        <p className="text-sm text-slate-400 mt-1">Configure and deploy a new virtual machine</p>
      </div>

      {/* Step indicator */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isComplete = i < step;
            return (
              <Fragment key={s.label}>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                      isComplete
                        ? 'bg-green-500/20 text-green-400'
                        : isActive
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-slate-700/50 text-slate-500'
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <span
                    className={`text-sm font-medium hidden sm:inline ${
                      isActive ? 'text-white' : isComplete ? 'text-green-400' : 'text-slate-500'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-3 ${
                      i < step ? 'bg-green-500/50' : 'bg-slate-700/50'
                    }`}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
        {/* Step 0: Basic Info */}
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white">Basic Information</h2>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">VM Name *</label>
              <input
                type="text"
                placeholder="e.g. my-web-server"
                value={config.name}
                onChange={(e) => updateConfig('name', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Image Path</label>
              <input
                type="text"
                placeholder="e.g. /var/lib/vmspawnd/images/fedora.qcow2"
                value={config.image}
                onChange={(e) => updateConfig('image', e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-slate-500 mt-1">Path to the OS image file (optional)</p>
            </div>
          </div>
        )}

        {/* Step 1: Resources */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">Resource Allocation</h2>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">CPU Cores</label>
                <span className="text-sm font-semibold text-white">{config.cpus} vCPU</span>
              </div>
              <input
                type="range"
                min={1}
                max={16}
                value={config.cpus}
                onChange={(e) => updateConfig('cpus', parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>1</span>
                <span>4</span>
                <span>8</span>
                <span>12</span>
                <span>16</span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">Memory</label>
                <span className="text-sm font-semibold text-white">{formatMemory(config.memory)}</span>
              </div>
              <input
                type="range"
                min={512}
                max={16384}
                step={256}
                value={config.memory}
                onChange={(e) => updateConfig('memory', parseInt(e.target.value))}
                className="w-full accent-purple-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>512 MB</span>
                <span>4 GB</span>
                <span>8 GB</span>
                <span>12 GB</span>
                <span>16 GB</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Storage */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">Storage Configuration</h2>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">Disk Size</label>
                <span className="text-sm font-semibold text-white">{config.disk} GB</span>
              </div>
              <input
                type="range"
                min={1}
                max={500}
                value={config.disk}
                onChange={(e) => updateConfig('disk', parseInt(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>1 GB</span>
                <span>100 GB</span>
                <span>250 GB</span>
                <span>500 GB</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white">Review Configuration</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Name', value: config.name },
                { label: 'Image', value: config.image || 'Default' },
                { label: 'CPU', value: `${config.cpus} vCPU` },
                { label: 'Memory', value: formatMemory(config.memory) },
                { label: 'Disk Size', value: `${config.disk} GB` },
              ].map((item) => (
                <div key={item.label} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
                  <span className="text-xs text-slate-500 uppercase tracking-wider">{item.label}</span>
                  <p className="text-sm font-semibold text-white mt-1 truncate">{item.value}</p>
                </div>
              ))}
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : navigateTo('vmList')}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {creating ? 'Creating...' : 'Create VM'}
          </button>
        )}
      </div>
    </div>
  );
}
