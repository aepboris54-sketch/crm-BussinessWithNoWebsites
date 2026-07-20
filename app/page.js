'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, subscribeToLeads } from '@/lib/supabase';
import {
  Mail,
  Phone,
  Plus,
  X,
  Search,
  Loader2,
  Trash2,
  Facebook,
  Instagram,
  Linkedin,
  Globe,
  CheckCircle2,
  Circle,
} from 'lucide-react';

const STATUS_COLORS = {
  New: 'bg-blue-100 text-blue-800',
  Contacted: 'bg-yellow-100 text-yellow-800',
  'In Progress': 'bg-purple-100 text-purple-800',
  'Closed-Won': 'bg-green-100 text-green-800',
  'Closed-Lost': 'bg-red-100 text-red-800',
};

const STATUS_OPTIONS = ['New', 'Contacted', 'In Progress', 'Closed-Won', 'Closed-Lost'];

const SERVICE_TABS = [
  { value: 'ai_chatbot', label: 'AI Chatbot Leads' },
  { value: 'website', label: 'No-Website Leads' },
];

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [serviceTab, setServiceTab] = useState('ai_chatbot');
  const [submitting, setSubmitting] = useState(false);
  const subscriptionRef = useRef(null);

  const [form, setForm] = useState({
    company_name: '',
    owner_first_name: '',
    owner_last_name: '',
    email: '',
    phone: '',
    facebook_url: '',
    linkedin_url: '',
    instagram_url: '',
    industry: '',
    location: '',
    service_type: 'ai_chatbot',
    website_url: '',
    notes: '',
  });

  useEffect(() => {
    fetchLeads();
  }, []);

  useEffect(() => {
    subscriptionRef.current = subscribeToLeads(
      (newLead) => {
        setLeads((prev) => [newLead, ...prev]);
      },
      (updatedLead) => {
        setLeads((prev) =>
          prev.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead))
        );
      },
      (deletedId) => {
        setLeads((prev) => prev.filter((lead) => lead.id !== deletedId));
      }
    );

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching leads:', error);
    } else {
      setLeads(data || []);
    }
    setLoading(false);
  };

  const handleAddLead = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    const { error } = await supabase.from('leads').insert([form]);

    if (error) {
      console.error('Error adding lead:', error);
      alert('Error adding lead');
    } else {
      setForm({
        company_name: '',
        owner_first_name: '',
        owner_last_name: '',
        email: '',
        phone: '',
        facebook_url: '',
        linkedin_url: '',
        instagram_url: '',
        industry: '',
        location: '',
        service_type: serviceTab,
      });
      setShowForm(false);
    }
    setSubmitting(false);
  };

  const handleStatusChange = async (id, newStatus) => {
    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleAuditToggle = async (id, currentValue) => {
    const { error } = await supabase
      .from('leads')
      .update({ human_audit: !currentValue })
      .eq('id', id);

    if (error) {
      console.error('Error updating audit flag:', error);
    }
  };

  const handleNotesBlur = async (id, notes) => {
    const { error } = await supabase.from('leads').update({ notes }).eq('id', id);

    if (error) {
      console.error('Error updating notes:', error);
    }
  };

  const handleDeleteLead = async (id, companyName) => {
    if (!confirm(`Delete ${companyName}? This cannot be undone.`)) return;

    const { error } = await supabase.from('leads').delete().eq('id', id);

    if (error) {
      console.error('Error deleting lead:', error);
    }
  };

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.owner_first_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (lead.owner_last_name?.toLowerCase() || '').includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' || lead.status === statusFilter;

    const matchesService = (lead.service_type || 'website') === serviceTab;

    return matchesSearch && matchesStatus && matchesService;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Lead Generation CRM
          </h1>
          <p className="text-gray-600">Manage and track your business leads</p>
        </div>

        <div className="mb-6 flex gap-2 border-b border-gray-200">
          {SERVICE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setServiceTab(tab.value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                serviceTab === tab.value
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-6 flex gap-4 flex-wrap items-center">
          <button
            onClick={() => {
              setForm((f) => ({ ...f, service_type: serviceTab }));
              setShowForm(!showForm);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={20} />
            Add Lead
          </button>

          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search by company or owner name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option>All</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {showForm && (
          <div className="mb-8 bg-white p-6 rounded-lg shadow border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">New Lead</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddLead} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Company Name *"
                required
                value={form.company_name}
                onChange={(e) =>
                  setForm({ ...form, company_name: e.target.value })
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="text"
                placeholder="First Name"
                value={form.owner_first_name}
                onChange={(e) =>
                  setForm({ ...form, owner_first_name: e.target.value })
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="text"
                placeholder="Last Name"
                value={form.owner_last_name}
                onChange={(e) =>
                  setForm({ ...form, owner_last_name: e.target.value })
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="tel"
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="url"
                placeholder="Website URL"
                value={form.website_url}
                onChange={(e) =>
                  setForm({ ...form, website_url: e.target.value })
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="url"
                placeholder="Facebook URL"
                value={form.facebook_url}
                onChange={(e) =>
                  setForm({ ...form, facebook_url: e.target.value })
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="url"
                placeholder="LinkedIn URL"
                value={form.linkedin_url}
                onChange={(e) =>
                  setForm({ ...form, linkedin_url: e.target.value })
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="url"
                placeholder="Instagram URL"
                value={form.instagram_url}
                onChange={(e) =>
                  setForm({ ...form, instagram_url: e.target.value })
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="text"
                placeholder="Industry / Business Type"
                value={form.industry}
                onChange={(e) =>
                  setForm({ ...form, industry: e.target.value })
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="text"
                placeholder="Location (city, neighborhood)"
                value={form.location}
                onChange={(e) =>
                  setForm({ ...form, location: e.target.value })
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <textarea
                placeholder="Notes — what to say when you call..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
                className="md:col-span-2 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />

              <button
                type="submit"
                disabled={submitting || !form.company_name}
                className="md:col-span-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={20} className="animate-spin" />}
                {submitting ? 'Adding...' : 'Add Lead'}
              </button>
            </form>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <Loader2 className="animate-spin inline mr-2" size={24} />
              Loading leads...
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No leads found. Create your first lead!
            </div>
          ) : (
            <>
              <div className="md:hidden divide-y divide-gray-200">
                {filteredLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className={`p-4 ${lead.human_audit ? 'bg-green-50 border-l-4 border-green-500' : ''}`}
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAuditToggle(lead.id, lead.human_audit)}
                          title={lead.human_audit ? 'Human audit: approved' : 'Mark as human-audited'}
                          className={lead.human_audit ? 'text-green-600' : 'text-gray-300 hover:text-gray-400'}
                        >
                          {lead.human_audit ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        </button>
                        <h3 className="font-medium text-gray-900">{lead.company_name}</h3>
                      </div>
                      <button
                        onClick={() => handleDeleteLead(lead.id, lead.company_name)}
                        className="text-red-500 hover:text-red-700 shrink-0"
                        title="Delete lead"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <p className="text-sm text-gray-500 mb-2">
                      {[lead.industry, lead.location].filter(Boolean).join(' • ') || '-'}
                    </p>

                    <div className="flex flex-col gap-1 mb-3 text-sm text-gray-600">
                      {lead.email && (
                        <div className="flex items-center gap-2">
                          <Mail size={16} className="text-blue-600" />
                          <span>{lead.email}</span>
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-2">
                          <Phone size={16} className="text-green-600" />
                          <span>{lead.phone}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex gap-3">
                        {lead.website_url && (
                          <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="text-gray-600" title="Website">
                            <Globe size={18} />
                          </a>
                        )}
                        {lead.facebook_url && (
                          <a href={lead.facebook_url} target="_blank" rel="noopener noreferrer" className="text-blue-600" title="Facebook">
                            <Facebook size={18} />
                          </a>
                        )}
                        {lead.linkedin_url && (
                          <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-700" title="LinkedIn">
                            <Linkedin size={18} />
                          </a>
                        )}
                        {lead.instagram_url && (
                          <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="text-pink-600" title="Instagram">
                            <Instagram size={18} />
                          </a>
                        )}
                      </div>

                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border-0 cursor-pointer ${STATUS_COLORS[lead.status]}`}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>

                    <textarea
                      defaultValue={lead.notes || ''}
                      onBlur={(e) => handleNotesBlur(lead.id, e.target.value)}
                      placeholder="What to say when you call..."
                      rows={4}
                      className="w-full mt-3 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    />

                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Audit
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Industry
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Social
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Notes
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Date Added
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className={`hover:bg-gray-50 transition ${lead.human_audit ? 'bg-green-50' : ''}`}
                    >
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => handleAuditToggle(lead.id, lead.human_audit)}
                          title={lead.human_audit ? 'Human audit: approved' : 'Mark as human-audited'}
                          className={lead.human_audit ? 'text-green-600' : 'text-gray-300 hover:text-gray-400'}
                        >
                          {lead.human_audit ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {lead.company_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {lead.industry || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {lead.location || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="flex flex-col gap-1">
                          {lead.email && (
                            <div className="flex items-center gap-2">
                              <Mail size={16} className="text-blue-600" />
                              <span>{lead.email}</span>
                            </div>
                          )}
                          {lead.phone && (
                            <div className="flex items-center gap-2">
                              <Phone size={16} className="text-green-600" />
                              <span>{lead.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          {lead.website_url && (
                            <a
                              href={lead.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-600 hover:text-gray-900"
                              title="Website"
                            >
                              <Globe size={16} />
                            </a>
                          )}
                          {lead.facebook_url && (
                            <a
                              href={lead.facebook_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                              title="Facebook"
                            >
                              <Facebook size={16} />
                            </a>
                          )}
                          {lead.linkedin_url && (
                            <a
                              href={lead.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-700 hover:text-blue-900"
                              title="LinkedIn"
                            >
                              <Linkedin size={16} />
                            </a>
                          )}
                          {lead.instagram_url && (
                            <a
                              href={lead.instagram_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-pink-600 hover:text-pink-800"
                              title="Instagram"
                            >
                              <Instagram size={16} />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <textarea
                          defaultValue={lead.notes || ''}
                          onBlur={(e) => handleNotesBlur(lead.id, e.target.value)}
                          placeholder="What to say when you call..."
                          rows={4}
                          className="w-72 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <select
                          value={lead.status}
                          onChange={(e) =>
                            handleStatusChange(lead.id, e.target.value)
                          }
                          className={`px-3 py-1 rounded-full text-sm font-medium border-0 cursor-pointer ${
                            STATUS_COLORS[lead.status]
                          }`}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => handleDeleteLead(lead.id, lead.company_name)}
                          className="text-red-500 hover:text-red-700"
                          title="Delete lead"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 text-sm text-gray-600 text-center">
          {SERVICE_TABS.find((t) => t.value === serviceTab)?.label}:{' '}
          <span className="font-semibold">
            {leads.filter((l) => (l.service_type || 'website') === serviceTab).length}
          </span>{' '}
          • Filtered: <span className="font-semibold">{filteredLeads.length}</span>
        </div>
      </div>
    </div>
  );
}
