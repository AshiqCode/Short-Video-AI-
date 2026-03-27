import React, { useState, useEffect } from "react";
import emailjs from "@emailjs/browser";
import { IoPaperPlaneOutline } from "react-icons/io5";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const ContactUs = () => {
  const [formData, setFormData] = useState({
    first_name: "",
    email: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { first_name, email, message } = formData;

    if (!first_name || !email || !message) {
      toast.error("Please fill out all fields!");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    const SERVICE_ID = "service_r47rh4n";
    const PUBLIC_KEY = "IZeQAt9QusTErsVma";

    const sendToAdmin = emailjs.send(
      SERVICE_ID,
      "template_b71q2a6",
      formData,
      PUBLIC_KEY
    );

    const sendToUser = emailjs.send(
      SERVICE_ID,
      "template_gmtcm6j",
      formData,
      PUBLIC_KEY
    );

    Promise.all([sendToAdmin, sendToUser])
      .then(() => {
        toast.success("Message sent! Check your inbox for confirmation.");
        setFormData({ first_name: "", email: "", message: "" });
      })
      .catch(() => {
        toast.error("Failed to send message. Please try again.");
      })
      .finally(() => setLoading(false));
  };

  const fields = [
    { name: "first_name", label: "Your Name", type: "text" },
    { name: "email", label: "Email Address", type: "email" },
    { name: "message", label: "Your Message", type: "textarea" },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-10">
      <ToastContainer position="top-right" autoClose={3000} theme="dark" />

      <div className="w-full max-w-4xl">
        <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">

          {/* Left Info Panel */}
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-sm font-medium uppercase tracking-[0.25em] text-cyan-300">
                Contact Us
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Get in Touch
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
                Have a question or want to work together? Send us a message
                and we'll get back to you quickly.
              </p>
            </div>

            <div className="space-y-4 px-6 py-6">
              {/* Info cards */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <p className="text-sm text-slate-400">Response time</p>
                <p className="mt-2 text-base font-semibold text-cyan-300">
                  Within 24 hours
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-5">
                <p className="text-sm text-cyan-200">We'd love to hear from you</p>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  Whether it's feedback, a collaboration idea, or just a hello
                  — our inbox is always open.
                </p>
              </div>
            </div>
          </section>

          {/* Right Form Panel */}
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
            <div className="border-b border-white/10 px-6 py-5">
              <h2 className="text-xl font-semibold text-white">Send a Message</h2>
              <p className="mt-1 text-sm text-slate-400">
                Fill in the form below and we'll be in touch.
              </p>
            </div>

            <div className="px-6 py-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                {fields.map(({ name, label, type }) => (
                  <div
                    key={name}
                    className="rounded-2xl border border-dashed border-cyan-400/30 bg-slate-900/60 p-4"
                  >
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      {label}
                    </label>

                    {type === "textarea" ? (
                      <textarea
                        name={name}
                        value={formData[name]}
                        onChange={handleChange}
                        rows={4}
                        placeholder={`Enter your ${label.toLowerCase()}...`}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 resize-none text-sm"
                        required
                      />
                    ) : (
                      <input
                        type={type}
                        name={name}
                        value={formData[name]}
                        onChange={handleChange}
                        placeholder={`Enter your ${label.toLowerCase()}...`}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 text-sm"
                        required
                      />
                    )}
                  </div>
                ))}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <IoPaperPlaneOutline className="text-lg" />
                      Send Message
                    </>
                  )}
                </button>
              </form>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
};

export default ContactUs;