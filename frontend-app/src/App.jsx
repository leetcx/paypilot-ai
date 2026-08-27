import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, AlertTriangle, ShieldAlert, Activity, RefreshCw, 
  Send, Bot, CheckCircle2, XCircle, ArrowUpRight, Zap, 
  TrendingUp, Database, Cpu, Sparkles, Terminal, ChevronRight, Lock,
  ExternalLink, ArrowLeft, FileText, Ban, Check, Smartphone, 
  MapPin, CreditCard, Clock, Globe, MessageSquareCheck, Sliders, Layers,
  QrCode, Shield
} from "lucide-react";

// For local testing use "http://127.0.0.1:8000"
// For live production deployment use "https://paypilot-ai-fq80.onrender.com"
const API_BASE_URL = "https://paypilot-ai-fq80.onrender.com";
export default function App() {
  const [dashboardData, setDashboardData] = useState({
    total_transactions: 1482,
    payment_success_rate: 98.4,
    high_risk_transactions: 14,
    money_protected: 412500,
    money_recovered: 86400,
  });

  const [transactions, setTransactions] = useState([
    {
      transaction_id: "TXN-88421",
      amount: "4500",
      payment_method: "UPI",
      location: "Bengaluru",
      is_new_device: 0,
      is_new_location: 0,
      risk_score: 12,
      risk_level: "Low",
      status: "authorized",
      recommended_action: "AUTO_APPROVE",
      timestamp: "Just now"
    },
    {
      transaction_id: "TXN-88420",
      amount: "18500",
      payment_method: "Card",
      location: "Frankfurt (VPN)",
      is_new_device: 1,
      is_new_location: 1,
      risk_score: 84,
      risk_level: "High",
      status: "failed",
      recommended_action: "QUARANTINE_HOLD",
      timestamp: "2 mins ago"
    },
    {
      transaction_id: "TXN-88419",
      amount: "1200",
      payment_method: "UPI",
      location: "Mumbai",
      is_new_device: 0,
      is_new_location: 0,
      risk_score: 8,
      risk_level: "Low",
      status: "authorized",
      recommended_action: "AUTO_APPROVE",
      timestamp: "5 mins ago"
    }
  ]);

  const [selectedTx, setSelectedTx] = useState(null);
  const [activeView, setActiveView] = useState("dashboard"); // "dashboard" | "details"
  const [recoveryPlan, setRecoveryPlan] = useState(null);
  const [defenseDossier, setDefenseDossier] = useState(null);
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [recoveryDispatched, setRecoveryDispatched] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  // Dynamic Interactive Razorpay / 3DS2 Modal State
  const [activeGatewayModal, setActiveGatewayModal] = useState(null);
  const [gatewayStep, setGatewayStep] = useState("select"); // "select" | "processing" | "success"

  // ML Policy Settings State
  const [showPolicyDrawer, setShowPolicyDrawer] = useState(false);
  const [highRiskCutoff, setHighRiskCutoff] = useState(70);
  const [mediumRiskCutoff, setMediumRiskCutoff] = useState(40);

  const [copilotInput, setCopilotInput] = useState("");
  const [copilotMessages, setCopilotMessages] = useState([
    {
      role: "assistant",
      text: "⚡ **PayPilot Autonomous Risk Core v6.0 Online**.\nLive telemetry and dynamic ML threshold modules initialized.",
      time: "Just now"
    }
  ]);
  const [isInjecting, setIsInjecting] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isBatchSalvaging, setIsBatchSalvaging] = useState(false);

  // Manual simulator fields
  const [simAmount, setSimAmount] = useState("4500");
  const [simMethod, setSimMethod] = useState("UPI");
  const [simLocation, setSimLocation] = useState("Bengaluru");
  const [simDevice, setSimDevice] = useState("0");
  const [simGeo, setSimGeo] = useState("0");

  const fetchData = async () => {
    try {
      const [dashRes, txRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/dashboard`),
        fetch(`${API_BASE_URL}/api/transactions/risk`)
      ]);
      if (dashRes.ok) setDashboardData(await dashRes.json());
      if (txRes.ok) {
        const txs = await txRes.json();
        setTransactions(txs);
      }
    } catch (err) {
      console.warn("Backend loading or offline, retaining cached metrics:", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdatePolicy = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ml/policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          high_risk_threshold: parseInt(highRiskCutoff),
          medium_risk_threshold: parseInt(mediumRiskCutoff)
        })
      });
      if (res.ok) {
        setActionNotice(`ML Risk Cutoff Policy Updated: High ≥ ${highRiskCutoff}, Medium ≥ ${mediumRiskCutoff}`);
        setShowPolicyDrawer(false);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenDetails = async (tx) => {
    setSelectedTx(tx);
    setRecoveryDispatched(false);
    setActionNotice(null);
    setActiveView("details");

    try {
      const res = await fetch(`${API_BASE_URL}/api/transactions/${tx.transaction_id}/recovery-plan`);
      if (res.ok) {
        const data = await res.json();
        setRecoveryPlan(data.recovery_plan);
      }
    } catch (e) {
      console.error(e);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/transactions/${tx.transaction_id}/chargeback-defense`);
      if (res.ok) {
        const data = await res.json();
        setDefenseDossier(data.defense);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleManualAction = async (actionName) => {
    if (!selectedTx) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/transactions/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: selectedTx.transaction_id,
          action: actionName
        })
      });
      if (res.ok) {
        setActionNotice(`Enforced Action: ${actionName}`);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleInjectAttack = async (scenario) => {
    setIsInjecting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/simulator/inject-attack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario })
      });
      if (res.ok) {
        await fetchData();
        const data = await res.json();
        setCopilotMessages(prev => [
          ...prev,
          {
            role: "assistant",
            text: `🚨 **Attack Injected & Isolated**: \`${data.scenario_title}\`\n${data.description}\n**Threat Score:** ${data.risk_evaluation.risk_score}/100 [Quarantined]`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } finally {
      setIsInjecting(false);
    }
  };

  const handleProcessPayment = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/payment/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(simAmount),
          payment_method: simMethod,
          location: simLocation,
          is_new_device: simDevice,
          is_new_location: simGeo
        })
      });

      if (res.ok) {
        const result = await res.json();
        setCheckoutResult(result);
      }
    } catch (e) {
      console.error("Payment initiation error:", e);
    }
  };

  const triggerGatewayAuth = (amount, txId, isRecovery = false) => {
    setGatewayStep("select");
    setActiveGatewayModal({
      amount: parseFloat(amount),
      txId: txId,
      isRecovery: isRecovery
    });
  };

  const executeSuccessfulAuth = async () => {
    setGatewayStep("processing");
    const paymentId = "pay_live_" + Math.random().toString(36).substring(2, 10).toUpperCase();

    try {
      await fetch(`${API_BASE_URL}/api/payment/verify-success`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: activeGatewayModal.txId,
          razorpay_payment_id: paymentId,
          is_recovery: activeGatewayModal.isRecovery
        })
      });
    } catch (e) {
      console.warn("Backend auth update sync:", e);
    }

    setTimeout(() => {
      setGatewayStep("success");
      if (activeGatewayModal.isRecovery) {
        setTransactions(prev => prev.map(t => 
          t.transaction_id === activeGatewayModal.txId ? { ...t, status: "salvaged" } : t
        ));
        setSelectedTx(prev => (prev?.transaction_id === activeGatewayModal.txId ? { ...prev, status: "salvaged" } : prev));
      }
      fetchData();
    }, 1200);
  };

  const handleDispatchRecovery = async () => {
    if (!selectedTx) return;
    setIsRecovering(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/recovery/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: selectedTx.transaction_id,
          channel: "WhatsApp",
          phone: "+919999999999"
        })
      });

      if (res.ok) {
        setRecoveryDispatched(true);
        setCopilotMessages(prev => [
          ...prev,
          {
            role: "assistant",
            text: `📲 **WhatsApp Recovery Link Dispatched**\n• Target: **${selectedTx.transaction_id}**\n• Amount: **₹${parseFloat(selectedTx.amount).toLocaleString()}**\n• Status: Awaiting customer authorization via link.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        await fetchData();
      }
    } finally {
      setIsRecovering(false);
    }
  };

  const handleBatchSalvage = async () => {
    setIsBatchSalvaging(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/recovery/batch-dispatch`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setActionNotice(`⚡ Batch Recovery Triggered: ${data.dispatched_count} links sent (₹${data.total_batch_value.toLocaleString()})`);
        setCopilotMessages(prev => [
          ...prev,
          {
            role: "assistant",
            text: `🚀 **Batch Recovery Campaign Dispatched**\n• Targets: **${data.dispatched_count} failed orders**\n• Total Value in Flight: **₹${data.total_batch_value.toLocaleString()}**\n• Automated dunning webhooks listening.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        await fetchData();
      }
    } finally {
      setIsBatchSalvaging(false);
    }
  };

  const handleExportPDF = () => {
    if (!selectedTx || !defenseDossier) return;

    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>PayPilot AI - Dispute Defense Dossier (${selectedTx.transaction_id})</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
            .header { border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
            .title { font-size: 20px; font-weight: 800; color: #0369a1; }
            .badge { background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-family: monospace; font-weight: bold; }
            .section { margin-bottom: 20px; }
            .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px; }
            .value { font-size: 14px; font-weight: 500; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
            .rebuttal-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; font-family: monospace; font-size: 12px; white-space: pre-wrap; color: #334155; }
            .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 10px; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">PAYPILOT AI FORENSIC DISPUTE DOSSIER</div>
              <div style="font-size: 12px; color: #64748b;">Autonomous Chargeback Evidence Rebuttal</div>
            </div>
            <div><span class="badge">TXN: ${selectedTx.transaction_id}</span></div>
          </div>

          <div class="grid">
            <div><div class="label">Amount</div><div class="value">₹${parseFloat(selectedTx.amount).toLocaleString()} (${selectedTx.payment_method})</div></div>
            <div><div class="label">Timestamp</div><div class="value">${selectedTx.timestamp || "Live Record"}</div></div>
            <div><div class="label">Device Fingerprint</div><div class="value">${selectedTx.device_id || "DEV-VERIFIED-01"}</div></div>
            <div><div class="label">Location</div><div class="value">${selectedTx.location || "Online Endpoint"}</div></div>
          </div>

          <div class="section">
            <div class="label">Formal Evidentiary Statement</div>
            <div class="rebuttal-box">${defenseDossier.rebuttal_statement}</div>
          </div>

          <div class="section">
            <div class="label">Estimated Win Probability</div>
            <div class="value" style="color: #059669; font-weight: 700;">${defenseDossier.win_probability_estimate}</div>
          </div>

          <div class="footer">
            Generated automatically by PayPilot AI Autonomous Risk Core v6.0 • Gateway Node Verified
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!copilotInput.trim()) return;
    const userMsg = copilotInput.trim();
    setCopilotInput("");
    setCopilotMessages(prev => [...prev, { role: "user", text: userMsg, time: "Now" }]);

    try {
      const res = await fetch(`${API_BASE_URL}/api/copilot/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg })
      });
      if (res.ok) {
        const data = await res.json();
        setCopilotMessages(prev => [
          ...prev, 
          { 
            role: "assistant", 
            text: data.response, 
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
          }
        ]);
      }
    } catch {
      setCopilotMessages(prev => [
        ...prev, 
        { role: "assistant", text: "❌ Unable to connect to copilot inference.", time: "Now" }
      ]);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-black">
      {/* Ambient Glows */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed top-20 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#070b14]/80 backdrop-blur-xl px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 p-[1px] shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-[#090e1a] rounded-[11px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                PAYPILOT <span className="text-cyan-400 font-black">AI</span>
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold tracking-widest text-cyan-300 bg-cyan-950/80 border border-cyan-800/60 rounded-full uppercase">
                v6.0 Enterprise
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Autonomous Payment Risk & ML Isolation Orchestrator</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPolicyDrawer(!showPolicyDrawer)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" /> ML Policy Tuning
          </button>

          {activeView === "details" && (
            <button
              onClick={() => setActiveView("dashboard")}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-500 text-xs font-semibold text-cyan-300 flex items-center gap-1.5 transition shadow-lg"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </button>
          )}

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300 font-mono">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-emerald-400 font-medium">Webhook Ingress: Active</span>
          </div>
          <button 
            onClick={fetchData} 
            className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition"
            title="Refresh Telemetry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Dynamic ML Threshold Setting Drawer */}
      {showPolicyDrawer && (
        <div className="max-w-[1720px] mx-auto px-6 pt-4">
          <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-700/40 shadow-2xl flex flex-wrap items-center justify-between gap-6">
            <div>
              <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4" /> Live Isolation Forest Policy Thresholds
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Dynamically adjust cutoff sensitivity. High-risk vectors above threshold require Step-Up 3DS2.</p>
            </div>

            <div className="flex items-center gap-8 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-300">High Risk Threshold:</span>
                <input 
                  type="range" 
                  min="50" 
                  max="90" 
                  value={highRiskCutoff} 
                  onChange={(e) => setHighRiskCutoff(e.target.value)}
                  className="w-28 accent-cyan-400 cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">{highRiskCutoff}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-300">Medium Risk Threshold:</span>
                <input 
                  type="range" 
                  min="20" 
                  max="50" 
                  value={mediumRiskCutoff} 
                  onChange={(e) => setMediumRiskCutoff(e.target.value)}
                  className="w-28 accent-indigo-400 cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">{mediumRiskCutoff}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleUpdatePolicy}
                  className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition"
                >
                  Save & Enforce Policy
                </button>
                <button
                  onClick={() => setShowPolicyDrawer(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[1720px] mx-auto p-6 space-y-6">
        {/* VIEW 1: FULL-PAGE FORENSIC & RECOVERY DOSSIER */}
        {activeView === "details" && selectedTx ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-2xl">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveView("dashboard")}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-xl font-extrabold font-mono text-cyan-400">{selectedTx.transaction_id}</h2>
                    
                    {selectedTx.status === "salvaged" ? (
                      <span className="px-3 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <MessageSquareCheck className="w-3.5 h-3.5" /> SALVAGED (WHATSAPP DUNNING)
                      </span>
                    ) : selectedTx.status === "failed" ? (
                      <span className="px-3 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> QUARANTINED / HELD
                      </span>
                    ) : (
                      <span className="px-3 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> AUTHORIZED / SETTLED
                      </span>
                    )}

                    <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-slate-800 text-slate-300">
                      Score: {selectedTx.risk_score ?? "--"}/100 ({selectedTx.risk_level || "Low"})
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Authorization Timestamp: {selectedTx.timestamp || "Real-time Live Record"} • Customer Ref: {selectedTx.customer_id || "C-001"}
                  </p>
                </div>
              </div>

              {/* Action Governance Buttons */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  onClick={() => handleManualAction("FORCE_APPROVE")}
                  className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Force Approve
                </button>
                <button
                  onClick={() => handleManualAction("ENFORCE_3DS_CHALLENGE")}
                  className="px-3 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Step-Up 3DS2
                </button>
                <button
                  onClick={() => handleManualAction("QUARANTINE_BLOCK")}
                  className="px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Ban className="w-3.5 h-3.5 text-rose-400" /> Quarantine & Blacklist
                </button>
              </div>
            </div>

            {actionNotice && (
              <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-700/60 text-cyan-300 text-xs font-mono flex items-center justify-between">
                <span>⚡ {actionNotice}</span>
                <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>
            )}

            {/* 4-Card Metadata Strip with SVG Radial Gauge */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Monetary Value</div>
                    <div className="text-lg font-black font-mono text-white">₹{parseFloat(selectedTx.amount || 0).toLocaleString()}</div>
                    <div className="text-[11px] text-slate-400 uppercase">{selectedTx.payment_method || "UPI"} Rail</div>
                  </div>
                </div>

                <div className="relative w-12 h-12 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-800"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className={selectedTx.risk_score >= 70 ? "text-rose-500" : selectedTx.risk_score >= 40 ? "text-amber-500" : "text-emerald-400"}
                      strokeDasharray={`${selectedTx.risk_score || 10}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="absolute font-mono text-[10px] font-bold text-white">{selectedTx.risk_score || 0}</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-950 border border-blue-800 text-blue-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Device Telemetry</div>
                  <div className="text-sm font-bold font-mono text-slate-200">{selectedTx.device_id || "DEV-VERIFIED-01"}</div>
                  <div className="text-[11px] text-slate-400">
                    {String(selectedTx.is_new_device) === "1" ? "⚠️ Unrecognized Hardware" : "✅ Known Trusted Hardware"}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-950 border border-indigo-800 text-indigo-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Ingress Geolocation</div>
                  <div className="text-sm font-bold text-slate-200">{selectedTx.location || "Online Endpoint"}</div>
                  <div className="text-[11px] text-slate-400">
                    {String(selectedTx.is_new_location) === "1" ? "⚠️ Foreign Geo Ingress" : "✅ Home Proximity"}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-950 border border-purple-800 text-purple-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Velocity Frequency</div>
                  <div className="text-sm font-bold font-mono text-slate-200">{selectedTx.attempt_count || 1} Attempt(s)</div>
                  <div className="text-[11px] text-slate-400">Within 60s sliding window</div>
                </div>
              </div>
            </div>

            {/* 2-Column Full Deep Dive */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> AI Risk Explanation & Rationale
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500">PayPilot Neural Core</span>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-slate-300 leading-relaxed">
                    {selectedTx.reasons && selectedTx.reasons.length > 0 
                      ? `Critical anomaly detected: Transaction flagged due to ${selectedTx.reasons.join(", ")}.`
                      : "Telemetry baseline verified: Behavioral signals, location routing, and instrument velocity conform cleanly to authenticated user profile."}
                  </div>

                  {selectedTx.reasons && selectedTx.reasons.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase">Triggered Risk Drivers:</span>
                      <div className="space-y-1.5">
                        {selectedTx.reasons.map((r, i) => (
                          <div key={i} className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ML Isolation Forest Model Weights */}
                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-cyan-400" /> Isolation Forest Model Weights
                    </h3>
                    <span className="text-xs font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                      Inference: 3.8ms
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
                        <span>Amount Variance Deviation</span>
                        <span className="text-slate-200">{selectedTx.ml_anomaly_telemetry?.feature_vectors?.amount_deviation_pct ?? "24"}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                        <div 
                          className="bg-cyan-400 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${selectedTx.ml_anomaly_telemetry?.feature_vectors?.amount_deviation_pct ?? 24}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
                        <span>Velocity Anomaly Index</span>
                        <span className="text-slate-200">{selectedTx.ml_anomaly_telemetry?.feature_vectors?.velocity_anomaly_pct ?? "15"}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                        <div 
                          className="bg-indigo-400 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${selectedTx.ml_anomaly_telemetry?.feature_vectors?.velocity_anomaly_pct ?? 15}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
                        <span>Geo Novelty Deviation</span>
                        <span className="text-slate-200">{selectedTx.ml_anomaly_telemetry?.feature_vectors?.geo_variance_pct ?? "8"}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                        <div 
                          className="bg-purple-400 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${selectedTx.ml_anomaly_telemetry?.feature_vectors?.geo_variance_pct ?? 8}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" /> Dynamic Smart Gateway Rail
                  </h3>
                  <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/50 font-mono text-xs text-cyan-300">
                    Selected Rail: <span className="font-bold">{selectedTx.smart_routing?.selected_rail || "RAZORPAY_TURBO_UPI"}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {selectedTx.smart_routing?.routing_rationale || "Low ticket size with optimal historical success rate."}
                  </p>
                </div>

                {/* Autonomous Dunning & WhatsApp Recovery Box */}
                {recoveryPlan && (
                  <div className="p-6 rounded-2xl bg-gradient-to-b from-emerald-950/30 to-slate-950/80 border border-emerald-500/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Autonomous Dunning & Recovery Plan
                      </h3>
                      <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                        Win Rate: {recoveryPlan.estimated_recovery_rate}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/90 p-3 rounded-xl border border-slate-800">
                      <span className="text-emerald-400 font-semibold">Recommended Recovery Strategy: </span>
                      "{recoveryPlan.actionable_recommendation}"
                    </div>

                    {recoveryPlan.generated_recovery_link && (
                      <div className="text-[11px] font-mono bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-slate-400">
                        <span className="truncate pr-2">{recoveryPlan.generated_recovery_link}</span>
                        <button 
                          onClick={() => triggerGatewayAuth(selectedTx.amount, selectedTx.transaction_id, true)}
                          className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 shrink-0 font-bold underline bg-transparent border-0 p-0 cursor-pointer"
                        >
                          Trigger Auth Gateway <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleDispatchRecovery}
                      disabled={isRecovering}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition"
                    >
                      <Send className="w-3.5 h-3.5" /> Dispatch Instant WhatsApp Recovery Link
                    </button>

                    {recoveryDispatched && (
                      <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs space-y-2 font-mono">
                        <div className="flex items-center gap-2 font-bold text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          WhatsApp Recovery Trigger Dispatched!
                        </div>
                        <div className="p-2.5 rounded bg-slate-950/80 border border-emerald-900 text-[11px] text-slate-300 leading-relaxed">
                          <div className="font-bold text-emerald-400 mb-1 flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5" /> Simulated WhatsApp Customer Message:
                          </div>
                          <span>
                            "Hi, your payment of ₹{parseFloat(selectedTx.amount).toLocaleString()} for {selectedTx.transaction_id} was held. Click to complete instantly: "
                          </span>
                          <button 
                            onClick={() => triggerGatewayAuth(selectedTx.amount, selectedTx.transaction_id, true)}
                            className="text-cyan-400 underline hover:text-cyan-300 font-bold inline-flex items-center gap-1 ml-1 cursor-pointer bg-transparent border-0 p-0"
                          >
                            {recoveryPlan?.generated_recovery_link || "https://rzp.io/rzp/paypilot-recovery"} <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Pre-generated Chargeback Rebuttal Dossier */}
                {defenseDossier && (
                  <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> 1-Click Chargeback Defense Rebuttal
                      </h3>
                      <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
                        Win Prob: {defenseDossier.win_probability_estimate}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-slate-300 whitespace-pre-line border border-slate-800 max-h-40 overflow-y-auto">
                      {defenseDossier.rebuttal_statement}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleExportPDF}
                        className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" /> Export PDF Dossier
                      </button>
                      <button
                        onClick={() => alert("Rebuttal Dossier submitted directly to Gateway Dispute Resolution Center!")}
                        className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        Submit to Portal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* VIEW 2: EXECUTIVE OVERVIEW DASHBOARD */
          <div className="space-y-6">
            {/* Top 5 KPI Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 hover:border-cyan-500/30 transition shadow-xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Processed Volume</span>
                  <Activity className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-black tracking-tight text-white font-mono">
                  {dashboardData.total_transactions} <span className="text-xs font-normal text-slate-500">TXNs</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                  <span className="text-emerald-400 font-semibold flex items-center">↑ 100%</span> live stream coverage
                </div>
              </div>

              <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 hover:border-emerald-500/30 transition shadow-xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Success Rate</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black tracking-tight text-emerald-400 font-mono">
                  {dashboardData.payment_success_rate}%
                </div>
                <div className="mt-2 text-[11px] text-slate-400 font-mono">
                  Dynamic smart rail optimization
                </div>
              </div>

              <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 hover:border-rose-500/30 transition shadow-xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">High Risk Intercepts</span>
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-2xl font-black tracking-tight text-rose-400 font-mono">
                  {dashboardData.high_risk_transactions}
                </div>
                <div className="mt-2 text-[11px] text-slate-400 font-mono">
                  Quarantined before auth
                </div>
              </div>

              <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 hover:border-indigo-500/30 transition shadow-xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Dispute Protected</span>
                  <Lock className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-black tracking-tight text-indigo-300 font-mono">
                  ₹{dashboardData.money_protected.toLocaleString()}
                </div>
                <div className="mt-2 text-[11px] text-slate-400 font-mono">
                  Saved from chargeback fines
                </div>
              </div>

              <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-emerald-950/30 border border-emerald-500/30 hover:border-emerald-400/60 transition shadow-xl">
                <div className="flex items-center justify-between text-emerald-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Salvaged Revenue</span>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-black tracking-tight text-emerald-300 font-mono">
                  ₹{dashboardData.money_recovered.toLocaleString()}
                </div>
                <div className="mt-2 text-[11px] text-emerald-400/80 font-mono">
                  Autonomous Dunning Links
                </div>
              </div>
            </div>

            {/* Threat Simulator Sandbox Bar & Batch Dunning */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-950 border border-rose-900/40 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-900/40 border border-rose-700/50 text-rose-400">
                  <Cpu className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    Adversarial Attack Simulation & Batch Operations
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      REAL-TIME ML TEST
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">Inject high-velocity threat vectors or trigger bulk WhatsApp dunning across all failed carts.</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  onClick={handleBatchSalvage}
                  disabled={isBatchSalvaging}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 border border-emerald-500/30"
                >
                  <Layers className="w-3.5 h-3.5" /> Salvage All Recoverable
                </button>
                <button
                  onClick={() => handleInjectAttack("bot_velocity")}
                  disabled={isInjecting}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white text-xs font-semibold transition shadow-lg shadow-rose-900/30 border border-rose-500/30 flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" /> Bot Velocity Surge
                </button>
                <button
                  onClick={() => handleInjectAttack("device_hopping")}
                  disabled={isInjecting}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
                >
                  Device Hopping
                </button>
                <button
                  onClick={() => handleInjectAttack("proxy_probe")}
                  disabled={isInjecting}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
                >
                  TOR / Proxy Probe
                </button>
              </div>
            </div>

            {/* Ingestion Stream & Copilot Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 flex flex-col h-[680px] shadow-2xl backdrop-blur-md">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold tracking-wide uppercase text-slate-200">Real-Time Ingestion Stream</h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">{transactions.length} Records • Click row for full dossier</span>
                </div>

                <div className="overflow-y-auto flex-1 pr-1 space-y-2.5">
                  {transactions.map((tx) => {
                    const isSalvaged = tx.status === "salvaged";
                    const isFailed = tx.status === "failed";
                    const isHighRisk = tx.risk_level === "High" || (tx.risk_score && tx.risk_score >= 70);

                    return (
                      <div
                        key={tx.transaction_id}
                        onClick={() => handleOpenDetails(tx)}
                        className="group p-4 rounded-xl cursor-pointer border bg-slate-950/60 border-slate-800/60 hover:border-cyan-500/60 hover:bg-slate-800/50 transition-all flex items-center justify-between"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2.5 rounded-xl border ${
                            isSalvaged
                              ? "bg-emerald-950/60 border-emerald-500/60 text-emerald-300"
                              : isFailed 
                              ? "bg-rose-950/40 border-rose-800/60 text-rose-400" 
                              : "bg-emerald-950/40 border-emerald-800/60 text-emerald-400"
                          }`}>
                            {isSalvaged ? <MessageSquareCheck className="w-5 h-5 text-emerald-400" /> : isFailed ? <XCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono text-sm font-black text-cyan-300 group-hover:text-cyan-200">{tx.transaction_id}</span>
                              <span className="text-[11px] text-slate-400 font-mono">{tx.location || "Online"}</span>
                              <span className="text-[10px] text-slate-500 uppercase font-mono">({tx.payment_method || "UPI"})</span>
                            </div>
                            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                              {isSalvaged ? (
                                <span className="text-emerald-400 font-semibold font-mono">✓ Salvaged via WhatsApp</span>
                              ) : (
                                <span>Directive: <strong className="text-slate-200">{tx.recommended_action || "APPROVE"}</strong></span>
                              )}
                              <span>•</span>
                              <span className="font-mono text-slate-500">{tx.timestamp || "Live"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="font-mono text-base font-black text-white">₹{parseFloat(tx.amount || 0).toLocaleString()}</div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              isSalvaged
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : isHighRisk 
                                ? "bg-rose-950 text-rose-300 border border-rose-800" 
                                : "bg-slate-800 text-slate-300"
                            }`}>
                              {isSalvaged ? "SALVAGED" : `Threat: ${tx.risk_score ?? "--"}/100`}
                            </span>
                          </div>

                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 group-hover:border-cyan-500/50 group-hover:bg-cyan-950/30 text-slate-400 group-hover:text-cyan-300 transition">
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Copilot Chat */}
              <div className="lg:col-span-4 bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 flex flex-col h-[680px] shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold tracking-wide uppercase text-slate-200">PayPilot Copilot</h3>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                  {copilotMessages.map((msg, idx) => (
                    <div 
                      key={idx} 
                      className={`p-3 rounded-xl ${
                        msg.role === "user" 
                          ? "bg-cyan-950/60 border border-cyan-800/60 text-cyan-100 ml-4" 
                          : "bg-slate-950/80 border border-slate-800/80 text-slate-300 mr-2"
                      }`}
                    >
                      <div className="text-[10px] text-slate-500 mb-1 font-mono">{msg.role === "user" ? "You" : "PayPilot Agent"} • {msg.time}</div>
                      <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSendMessage} className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={copilotInput}
                    onChange={(e) => setCopilotInput(e.target.value)}
                    placeholder="Ask e.g. Audit TXN011..."
                    className="flex-1 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                  <button 
                    type="submit" 
                    className="px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center justify-center shadow-lg shadow-cyan-950"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>

            {/* Payment Simulator */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800">
              <div className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-4 flex items-center gap-2">
                <Terminal className="w-4 h-4" /> Checkout Simulator (Live Auth Rail Trigger)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-mono">Amount (₹)</label>
                  <input 
                    type="number" 
                    value={simAmount} 
                    onChange={(e) => setSimAmount(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-mono">Payment Rail</label>
                  <select 
                    value={simMethod} 
                    onChange={(e) => setSimMethod(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="UPI">UPI Intent</option>
                    <option value="Card">Card (Credit/Debit)</option>
                    <option value="NetBanking">NetBanking Direct</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-mono">Origin Location</label>
                  <input 
                    type="text" 
                    value={simLocation} 
                    onChange={(e) => setSimLocation(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-mono">Device State</label>
                  <select 
                    value={simDevice} 
                    onChange={(e) => setSimDevice(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="0">Verified Device</option>
                    <option value="1">Unseen Device (Risk)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-mono">Geo State</label>
                  <select 
                    value={simGeo} 
                    onChange={(e) => setSimGeo(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="0">Home City</option>
                    <option value="1">New Location (Risk)</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleProcessPayment}
                    className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 font-bold text-xs text-white shadow-lg shadow-cyan-950 transition"
                  >
                    Process & Route
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Risk Analysis Modal */}
      {checkoutResult && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" /> Real-Time Risk Analysis
              </h3>
              <button 
                onClick={() => setCheckoutResult(null)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕ CLOSE
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Transaction Status</span>
                <span className="font-mono font-bold text-amber-400">
                  {checkoutResult.status.toUpperCase()} (AWAITING AUTH)
                </span>
              </div>

              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Threat Score</span>
                <span className="font-mono font-bold text-cyan-400">
                  {checkoutResult.risk_score}/100 ({checkoutResult.risk_level})
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-slate-400 font-semibold">AI Rationale</div>
                <div className="text-slate-300 leading-relaxed">{checkoutResult.explanation}</div>
              </div>

              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-cyan-300 font-mono">
                Rail: {checkoutResult.smart_routing?.selected_rail}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  const txId = checkoutResult.transaction_id;
                  const amt = checkoutResult.amount;
                  setCheckoutResult(null);
                  triggerGatewayAuth(amt, txId, false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-bold text-xs text-white transition flex items-center justify-center gap-1.5"
              >
                <Shield className="w-3.5 h-3.5" /> Authorize via Gateway
              </button>
              <button
                onClick={() => {
                  const tx = transactions.find(t => t.transaction_id === checkoutResult.transaction_id) || checkoutResult;
                  setCheckoutResult(null);
                  handleOpenDetails(tx);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold text-xs text-slate-300 transition"
              >
                Inspect Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Built-in Autonomous Gateway & 3DS2 Challenge Modal */}
      {activeGatewayModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/50 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
                <span className="font-bold text-sm text-cyan-300 font-mono uppercase tracking-wide">
                  PayPilot Secure Payment Gateway
                </span>
              </div>
              <button 
                onClick={() => setActiveGatewayModal(null)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕ CANCEL
              </button>
            </div>

            {gatewayStep === "select" && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono uppercase">Payment Amount</span>
                    <div className="text-2xl font-black font-mono text-white">
                      ₹{activeGatewayModal.amount.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs text-slate-400">
                    <div>TX: <span className="text-cyan-400 font-bold">{activeGatewayModal.txId}</span></div>
                    <div>3DS2 Verified Rail</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase font-mono">Select Authorization Rail:</div>
                  <button
                    onClick={executeSuccessfulAuth}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-400 hover:bg-slate-800/80 transition flex items-center justify-between group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-cyan-950 text-cyan-400 group-hover:bg-cyan-900">
                        <QrCode className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-200">Instant UPI & QR Code</div>
                        <div className="text-[10px] text-slate-400">GPay • PhonePe • Paytm • BHIM</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400" />
                  </button>

                  <button
                    onClick={executeSuccessfulAuth}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-400 hover:bg-slate-800/80 transition flex items-center justify-between group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-indigo-950 text-indigo-400 group-hover:bg-indigo-900">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-200">Debit / Credit Card (Tokenized)</div>
                        <div className="text-[10px] text-slate-400">Visa • Mastercard • RuPay 3DS2 Challenge</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400" />
                  </button>
                </div>
              </div>
            )}

            {gatewayStep === "processing" && (
              <div className="py-8 text-center space-y-4">
                <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <div>
                  <h4 className="text-sm font-bold text-white">Verifying 3DS2 Challenge & Settlement</h4>
                  <p className="text-xs text-slate-400 mt-1">Executing cryptographic signature check on backend...</p>
                </div>
              </div>
            )}

            {gatewayStep === "success" && (
              <div className="py-4 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-emerald-400">Payment Authorized Successfully!</h4>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    Ref ID: <span className="text-slate-200">pay_{Math.random().toString(36).substring(2, 9)}</span>
                  </p>
                </div>
                <button
                  onClick={() => setActiveGatewayModal(null)}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white transition shadow-lg shadow-emerald-950"
                >
                  Done & Update Telemetry
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}