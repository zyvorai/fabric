import { Globe, Server, Activity, ExternalLink } from 'lucide-react';
import { serviceApi } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import { getStatusBadgeClasses } from '../utils/format';

interface Service {
  id?: string;
  name?: string;
  status?: string;
  state?: string;
  endpoints?: string[];
  backends?: string[];
  port?: number;
  protocol?: string;
}

export default function ServiceMap() {
  const { data: rawServices, loading } = usePolling<Service[]>(
    () => serviceApi.list() as Promise<Service[]>,
    15000
  );

  const services: Service[] = rawServices || [];

  if (loading && services.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Service Map</h1>
        <p className="text-sm text-slate-400 mt-1">Service mesh overview and status</p>
      </div>

      {services.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500">
          <Globe className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <p className="text-lg font-medium text-slate-400">No services configured</p>
          <p className="text-sm mt-1">Services will appear here once they are registered</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((svc, idx) => {
            const state = svc.status || svc.state || 'unknown';
            return (
              <div key={svc.id || idx} className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-blue-400" />
                    <h3 className="text-white font-medium">{svc.name || `Service ${idx + 1}`}</h3>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(state)}`}>
                    {state}
                  </span>
                </div>

                {svc.port && (
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <span className="text-slate-400">Port:</span>
                    <span className="text-white font-mono">{svc.port}</span>
                    {svc.protocol && (
                      <span className="text-slate-500">({svc.protocol})</span>
                    )}
                  </div>
                )}

                {svc.endpoints && svc.endpoints.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs text-slate-400 uppercase">Endpoints</span>
                    <div className="mt-1 space-y-1">
                      {svc.endpoints.map((ep, i) => (
                        <div key={i} className="flex items-center gap-1 text-sm text-slate-300">
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                          <span className="font-mono text-xs">{ep}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {svc.backends && svc.backends.length > 0 && (
                  <div>
                    <span className="text-xs text-slate-400 uppercase">Backends</span>
                    <div className="mt-1 space-y-1">
                      {svc.backends.map((be, i) => (
                        <div key={i} className="flex items-center gap-1 text-sm text-slate-300">
                          <Activity className="w-3 h-3 text-slate-500" />
                          <span className="font-mono text-xs">{be}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!svc.endpoints || svc.endpoints.length === 0) && (!svc.backends || svc.backends.length === 0) && (
                  <p className="text-xs text-slate-500 mt-2">No endpoints or backends configured</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
