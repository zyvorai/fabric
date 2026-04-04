import { useState, useCallback } from 'react';
import { contentLibraryApi } from '../utils/api';
import { formatBytes, formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { ContentLibrary as ContentLibraryType, ContentLibraryItem } from '../types';

export default function ContentLibrary() {
  const [libName, setLibName] = useState('');
  const [libType, setLibType] = useState('local');
  const [libPath, setLibPath] = useState('');
  const [selectedLib, setSelectedLib] = useState('');
  const [specName, setSpecName] = useState('');
  const [profileName, setProfileName] = useState('');

  const fetchLibraries = useCallback(() => contentLibraryApi.listLibraries() as Promise<ContentLibraryType[]>, []);
  const fetchItems = useCallback(
    () => (selectedLib ? contentLibraryApi.listItems(selectedLib) as Promise<ContentLibraryItem[]> : Promise.resolve([])),
    [selectedLib]
  );
  const fetchSpecs = useCallback(() => contentLibraryApi.listCustomizationSpecs(), []);
  const fetchProfiles = useCallback(() => contentLibraryApi.listHostProfiles(), []);

  const { data: libsData, refresh: refreshLibs } = usePolling<ContentLibraryType[]>(fetchLibraries, 15000);
  const { data: itemsData, refresh: refreshItems } = usePolling<ContentLibraryItem[]>(fetchItems, 10000, !!selectedLib);
  const { data: specsData, refresh: refreshSpecs } = usePolling<unknown[]>(fetchSpecs, 30000);
  const { data: profilesData, refresh: refreshProfiles } = usePolling<unknown[]>(fetchProfiles, 30000);

  const libraries = (libsData || []) as ContentLibraryType[];
  const items = (itemsData || []) as ContentLibraryItem[];
  const specs = (specsData || []) as { id: string; name: string }[];
  const profiles = (profilesData || []) as { id: string; name: string }[];

  const handleCreateLib = async () => {
    if (!libName.trim() || !libPath.trim()) return;
    try { await contentLibraryApi.createLibrary({ name: libName, type: libType, storage_path: libPath }); setLibName(''); setLibPath(''); refreshLibs(); }
    catch (err) { console.error('Failed to create library:', err); }
  };

  const handleSyncLib = async (id: string) => {
    try { await contentLibraryApi.syncLibrary(id); refreshLibs(); }
    catch (err) { console.error('Failed to sync library:', err); }
  };

  const handleDeleteLib = async (id: string) => {
    if (!confirm('Delete this library?')) return;
    try { await contentLibraryApi.deleteLibrary(id); refreshLibs(); if (selectedLib === id) setSelectedLib(''); }
    catch (err) { console.error('Failed to delete library:', err); }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try { await contentLibraryApi.deleteItem(id); refreshItems(); }
    catch (err) { console.error('Failed to delete item:', err); }
  };

  const handleCreateSpec = async () => {
    if (!specName.trim()) return;
    try { await contentLibraryApi.createCustomizationSpec({ name: specName }); setSpecName(''); refreshSpecs(); }
    catch (err) { console.error('Failed to create spec:', err); }
  };

  const handleCreateProfile = async () => {
    if (!profileName.trim()) return;
    try { await contentLibraryApi.createHostProfile({ name: profileName }); setProfileName(''); refreshProfiles(); }
    catch (err) { console.error('Failed to create profile:', err); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Content Library</h2>
        <p className="text-sm text-slate-400 mt-1">Manage libraries, items, customization specs, and host profiles</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Create Library</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input value={libName} onChange={e => setLibName(e.target.value)} placeholder="Library name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <select value={libType} onChange={e => setLibType(e.target.value)} className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
            <option value="local">Local</option><option value="subscribed">Subscribed</option>
          </select>
          <input value={libPath} onChange={e => setLibPath(e.target.value)} placeholder="Storage path" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleCreateLib} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Libraries</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Path</th><th className="px-5 py-3">Items</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {libraries.map(lib => (
              <tr key={lib.id} className={`text-slate-300 hover:bg-slate-700/30 cursor-pointer ${selectedLib === lib.id ? 'bg-slate-700/40' : ''}`} onClick={() => setSelectedLib(lib.id)}>
                <td className="px-5 py-3 text-white font-medium">{lib.name}</td>
                <td className="px-5 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">{lib.type}</span></td>
                <td className="px-5 py-3 font-mono text-xs">{lib.storage_path}</td>
                <td className="px-5 py-3">{lib.item_count}</td>
                <td className="px-5 py-3 space-x-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => handleSyncLib(lib.id)} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg">Sync</button>
                  <button onClick={() => handleDeleteLib(lib.id)} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button>
                </td>
              </tr>
            ))}
            {libraries.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No libraries</td></tr>}
          </tbody>
        </table>
      </div>

      {selectedLib && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Items</h3></div>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Size</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-700/50">
              {items.map(item => (
                <tr key={item.id} className="text-slate-300 hover:bg-slate-700/30">
                  <td className="px-5 py-3 text-white font-medium">{item.name}</td>
                  <td className="px-5 py-3">{item.type}</td>
                  <td className="px-5 py-3">{formatBytes(item.size)}</td>
                  <td className="px-5 py-3 text-xs">{formatDateTime(item.created_at)}</td>
                  <td className="px-5 py-3"><button onClick={() => handleDeleteItem(item.id)} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No items in this library</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">Customization Specs</h3>
          <div className="flex gap-2 mb-4">
            <input value={specName} onChange={e => setSpecName(e.target.value)} placeholder="Spec name" className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleCreateSpec} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg">Create</button>
          </div>
          <div className="space-y-2">
            {specs.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg">
                <span className="text-white text-sm">{s.name}</span>
                <button onClick={async () => { await contentLibraryApi.deleteCustomizationSpec(s.id); refreshSpecs(); }} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button>
              </div>
            ))}
            {specs.length === 0 && <p className="text-center text-slate-500 text-sm py-4">No specs</p>}
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">Host Profiles</h3>
          <div className="flex gap-2 mb-4">
            <input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Profile name" className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleCreateProfile} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg">Create</button>
          </div>
          <div className="space-y-2">
            {profiles.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg">
                <span className="text-white text-sm">{p.name}</span>
                <button onClick={async () => { await contentLibraryApi.deleteHostProfile(p.id); refreshProfiles(); }} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button>
              </div>
            ))}
            {profiles.length === 0 && <p className="text-center text-slate-500 text-sm py-4">No profiles</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
