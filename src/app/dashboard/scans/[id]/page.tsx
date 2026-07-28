import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function ScanDetailsPage({ params }: { params: { id: string } }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return <div className="p-8 text-white">Unauthorized. Please <Link href="/login" className="text-emerald-500">log in</Link>.</div>;
    }

    const { data: scan } = await supabase
        .from('scans')
        .select('*')
        .eq('id', params.id)
        .eq('user_id', user.id)
        .single();

    if (!scan) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-[#01040f] text-white p-8">
            <div className="max-w-5xl mx-auto space-y-8">
                
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Scan Details</h1>
                        <p className="text-slate-400 mt-1">{scan.target_url}</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                            scan.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                            scan.status === 'Queued' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                            'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                        }`}>
                            {scan.status}
                        </span>
                    </div>
                </div>

                {/* Dual View Container */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Stakeholder View (Left) */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <span className="text-emerald-500">📊</span> Stakeholder View
                        </h2>
                        
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg text-center">
                                    <div className="text-sm text-slate-400 uppercase tracking-wider mb-1">Health Score</div>
                                    <div className={`text-4xl font-black ${scan.security_health_score === 'A' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                        {scan.security_health_score || 'N/A'}
                                    </div>
                                </div>
                                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg text-center">
                                    <div className="text-sm text-slate-400 uppercase tracking-wider mb-1">Vulns Found</div>
                                    <div className="text-4xl font-black text-rose-500">
                                        {scan.vulns_found}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg">
                                <div className="text-sm text-slate-400 uppercase tracking-wider mb-2">Estimated Remediation Effort</div>
                                <div className="text-2xl font-bold">
                                    {scan.estimated_patch_hours ? `${scan.estimated_patch_hours} Hours` : 'Pending Analysis'}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">Based on Gemini AI complexity analysis of required patches.</p>
                            </div>
                        </div>
                    </div>

                    {/* Developer View (Right) */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <span className="text-blue-500">💻</span> Developer View
                        </h2>
                        
                        {scan.ai_remediation_diff ? (
                            <div className="space-y-6">
                                <div>
                                    <div className="text-sm text-slate-400 uppercase tracking-wider mb-2">Unified Git Diff (Ready for PR)</div>
                                    <pre className="bg-slate-950 border border-slate-800 p-4 rounded-lg overflow-x-auto text-sm font-mono text-emerald-400">
                                        {scan.ai_remediation_diff}
                                    </pre>
                                </div>

                                <div>
                                    <div className="text-sm text-slate-400 uppercase tracking-wider mb-2">Automated Unit Test</div>
                                    <pre className="bg-slate-950 border border-slate-800 p-4 rounded-lg overflow-x-auto text-sm font-mono text-blue-400">
                                        {scan.ai_unit_test}
                                    </pre>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 min-h-[300px]">
                                {scan.status === 'Queued' || scan.status === 'Running' ? (
                                    <>
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-4"></div>
                                        <p>AI Engine is analyzing vulnerabilities...</p>
                                    </>
                                ) : (
                                    <p>No remediation data available for this scan.</p>
                                )}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
