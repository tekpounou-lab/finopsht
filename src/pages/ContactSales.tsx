import React, { useState } from "react";
import { Mail, Phone, Building, Users, Send, CheckCircle2, MessageSquare, ArrowLeft, Shield } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAnalytics } from "../lib/analyticsHooks";
import { MarketingLanguage, marketingTranslations } from "../lib/marketingTranslations";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";

interface ContactSalesProps {
  language: MarketingLanguage;
  onBackToWeb: () => void;
}

export default function ContactSales({ language, onBackToWeb }: ContactSalesProps) {
  const t = marketingTranslations[language];
  const { trackCta, trackOnboarding } = useAnalytics();
  const contact = t.contactSales;

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [teamSize, setTeamSize] = useState("10-50");
  const [message, setMessage] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !businessName) return;

    setIsSubmitting(true);
    trackOnboarding("contact_sales_submit_attempt", { email, businessName, teamSize });

    try {
      await addDoc(collection(db, "sales_requests"), {
        name,
        email,
        phone,
        businessName,
        teamSize,
        message,
        createdAt: serverTimestamp()
      });
      setIsSubmitted(true);
      trackOnboarding("contact_sales_submitted_success", { email, businessName, teamSize });
    } catch (error: any) {
      console.error("Error saving sales request:", error);
      toast.error(language === "fr" ? "Erreur lors de l'enregistrement de votre demande." : language === "ht" ? "Erè pandan anrejistreman demann ou an." : "Error recording your request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative py-12 px-6 bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center font-sans overflow-hidden" id="contact-sales-form-viewport">
      {/* Background radial soft light */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none -z-10 animate-pulse"></div>

      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left Side: Brand Value Proposition & Trust Badges */}
        <div className="lg:col-span-5 text-center lg:text-left">
          <button
            onClick={onBackToWeb}
            className="mb-8 text-slate-400 hover:text-slate-200 text-xs font-mono font-bold uppercase cursor-pointer inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {contact.back}
          </button>
          <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-bold rounded-full uppercase tracking-wider inline-block mb-4">
            {contact.branding}
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-100">
            {contact.title}
          </h2>
          <p className="text-slate-400 text-xs mt-3 leading-relaxed">
            {contact.subtitle}
          </p>

          <div className="mt-8 space-y-4 text-left">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/30 border border-slate-900">
              <Phone className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-slate-200 text-xs font-bold font-sans">{contact.supportTitle}</h4>
                <p className="text-slate-500 text-[10px] font-mono mt-0.5">{contact.supportDesc}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/30 border border-slate-900">
              <Shield className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-slate-200 text-xs font-bold font-sans">{contact.auditTitle}</h4>
                <p className="text-slate-400 text-[11px]">
                  {contact.auditDesc}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Dynamic Contact Form card */}
        <div className="lg:col-span-7">
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 md:p-8 shadow-xl backdrop-blur-md relative overflow-hidden" id="sales-form-card">
            <AnimatePresence mode="wait">
              {!isSubmitted ? (
                <motion.form
                  key="contact-form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >
                  <h3 className="text-lg font-bold text-slate-100 flex items-center gap-1.5 mb-2">
                    <MessageSquare className="w-5 h-5 text-cyan-400" /> {contact.formTitle}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">{contact.name} *</label>
                      <input
                        type="text"
                        required
                        placeholder="Manoel Lhérisson"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition focus:ring-1 focus:ring-cyan-500/20"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">{contact.email} *</label>
                      <input
                        type="email"
                        required
                        placeholder="tekpounou@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition focus:ring-1 focus:ring-cyan-500/20"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">{contact.phone}</label>
                      <input
                        type="text"
                        placeholder="+509 xx-xx-xx"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition focus:ring-1 focus:ring-cyan-500/20"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">{contact.company} *</label>
                      <input
                        type="text"
                        required
                        placeholder="FinOps Haiti SA"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition focus:ring-1 focus:ring-cyan-500/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">{contact.teamSize} *</label>
                    <div className="flex gap-2">
                      {["5-20", "20-50", "50-200", "200+"].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => {
                            setTeamSize(size);
                            trackCta(`select_team_size_${size}`, "contact_sales");
                          }}
                          className={`flex-1 text-xs font-mono font-bold py-2 border rounded-xl text-center transition cursor-pointer ${
                            teamSize === size
                              ? "bg-cyan-500/10 border-cyan-400 text-cyan-400 shadow-md"
                              : "bg-slate-950/20 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">{contact.message}</label>
                    <textarea
                      placeholder="Comment pouvons-nous vous aider à automatiser vos opérations et vos pointages QR ?"
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition focus:ring-1 focus:ring-cyan-500/20 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    id="btn-submit-sales"
                    disabled={isSubmitting}
                    className="mt-6 w-full py-2.5 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-mono font-extrabold transition duration-200 cursor-pointer text-center flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/15"
                  >
                    {isSubmitting ? (
                      <>
                        <Users className="w-4 h-4 animate-spin" /> {contact.submitting}
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" /> {contact.submit}
                      </>
                    )}
                  </button>
                </motion.form>
              ) : (
                <motion.div
                  key="success-form"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8"
                >
                  <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-100">{contact.successTitle}</h3>
                  <p className="text-slate-400 text-xs mt-3 leading-relaxed max-w-sm mx-auto">
                    {contact.successDesc(name, email)}
                  </p>

                  <button
                    onClick={onBackToWeb}
                    className="mt-8 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-cyan-400 text-xs font-mono font-bold rounded-xl cursor-pointer border border-cyan-500/20 inline-block transition"
                  >
                    {contact.backBtn}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
