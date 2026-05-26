// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { Zap, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { systemApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

interface Recommendation {
  id?: string;
  priority?: string;
  category?: string;
  description?: string;
  impact?: string;
  action?: string;
}

function getPriorityBadge(priority: string) {
  switch (priority?.toLowerCase()) {
    case 'high': case 'critical': return 'bg-red-500/20 text-red-400';
    case 'medium': return 'bg-yellow-500/20 text-yellow-400';
    case 'low': return 'bg-green-500/20 text-green-400';
    default: return 'bg-slate-500/20 text-slate-400';
  }
}

function getPriorityIcon(priority: string) {
  switch (priority?.toLowerCase()) {
    case 'high': case 'critical': return AlertTriangle;
    case 'medium': return TrendingUp;
    default: return CheckCircle;
  }
}

export default function ResourceOptimizer() {
  const { data: rawRecs, loading } = usePolling<Recommendation[]>(
    () => systemApi.getOptimizationRecommendations() as Promise<Recommendation[]>,
    30000
  );

  const recommendations: Recommendation[] = rawRecs || [];

  const stats = {
    total: recommendations.length,
    high: recommendations.filter((r) => r.priority?.toLowerCase() === 'high').length,
    medium: recommendations.filter((r) => r.priority?.toLowerCase() === 'medium').length,
    low: recommendations.filter((r) => r.priority?.toLowerCase() === 'low').length,
  };

  if (loading && recommendations.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Resource Optimizer</h1>
        <p className="text-sm text-slate-400 mt-1">Optimization recommendations for your infrastructure</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Zap, color: 'text-blue-400' },
          { label: 'High Priority', value: stats.high, icon: AlertTriangle, color: 'text-red-400' },
          { label: 'Medium', value: stats.medium, icon: TrendingUp, color: 'text-yellow-400' },
          { label: 'Low', value: stats.low, icon: CheckCircle, color: 'text-green-400' },
        ].map((s) => (
          <div key={s.label} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">{s.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
              </div>
              <s.icon className={`w-8 h-8 ${s.color}`} />
            </div>
          </div>
        ))}
      </div>

      {recommendations.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          No optimization recommendations at this time
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec, idx) => {
            const Icon = getPriorityIcon(rec.priority || 'low');
            return (
              <div key={rec.id || idx} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <Icon className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityBadge(rec.priority || 'low')}`}>
                          {rec.priority || 'low'}
                        </span>
                        {rec.category && (
                          <span className="text-xs text-slate-500">{rec.category}</span>
                        )}
                      </div>
                      <p className="text-sm text-white">{rec.description || 'No description'}</p>
                      {rec.impact && (
                        <p className="text-xs text-slate-400 mt-1">Impact: {rec.impact}</p>
                      )}
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex-shrink-0">
                    Apply
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
