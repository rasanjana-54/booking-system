import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Edit3, Plus, Shield, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';
import { useVillaData } from '../contexts/VillaDataContext';
import { useToast } from '../contexts/ToastContext';
import {
  MAX_STAFF_ACCOUNTS,
  STAFF_SLOT_NUMBERS,
  type StaffMember,
} from '../types/villa';
import { staffSchema } from '../utils/validation';
import { formatColomboTimestamp } from '../utils/colomboTime';
import {
  createStaffAccount,
  deleteStaffAccount,
  SUPER_ADMIN_EMAIL,
  updateStaffAccount,
} from '../services/villaService';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';

type StaffFormValues = z.infer<typeof staffSchema>;

export const StaffManagementPage: React.FC = () => {
  const { buildActorContext } = useAuth();
  const { staffMembers, authorizedEmails, adminEmails } = useVillaData();
  const { notify } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema) as never,
    defaultValues: {
      email: '',
      name: '',
      role: 'STAFF',
      phone: '',
      whatsappPhone: '',
      isActive: true,
    },
  });

  const openAddModal = () => {
    setEditingStaff(null);
    setFormErr(null);
    reset({
      email: '',
      name: '',
      role: 'STAFF',
      phone: '',
      whatsappPhone: '',
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (s: StaffMember) => {
    setEditingStaff(s);
    setFormErr(null);
    reset({
      email: s.email,
      name: s.name,
      role: s.role,
      phone: s.phone || '',
      whatsappPhone: s.whatsappPhone || '',
      isActive: s.isActive,
    });
    setModalOpen(true);
  };

  const onSubmit = async (values: StaffFormValues) => {
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    setSubmitting(true);
    setFormErr(null);
    try {
      if (editingStaff) {
        await updateStaffAccount(actor, staffMembers, editingStaff.id, {
          name: values.name,
          role: values.role,
          phone: values.phone,
          whatsappPhone: values.whatsappPhone,
          isActive: values.isActive,
        });
        notify('Staff account updated', 'success', editingStaff.email);
      } else {
        await createStaffAccount(actor, staffMembers, {
          email: values.email,
          name: values.name,
          role: values.role,
          phone: values.phone,
          whatsappPhone: values.whatsappPhone,
          isActive: values.isActive,
        });
        notify('Authorized staff account provisioned', 'success', values.email);
      }
      setModalOpen(false);
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Unable to save staff account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (s: StaffMember) => {
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    try {
      await updateStaffAccount(actor, staffMembers, s.id, {
        name: s.name,
        role: s.role,
        phone: s.phone,
        whatsappPhone: s.whatsappPhone,
        isActive: !s.isActive,
      });
      notify(
        s.isActive ? 'Staff account deactivated' : 'Staff account reactivated',
        'success',
        s.email
      );
    } catch (err) {
      notify('Action failed', 'error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    setSubmitting(true);
    try {
      await deleteStaffAccount(actor, staffMembers, deleteTarget.id);
      notify('Staff account removed', 'success', deleteTarget.email);
      setDeleteTarget(null);
    } catch (err) {
      notify('Delete failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const slotsRemaining = Math.max(0, MAX_STAFF_ACCOUNTS - staffMembers.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2
            className="text-2xl sm:text-3xl font-semibold text-[#1C2420]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Authorized Staff Management
          </h2>
          <p className="text-sm text-[#6E6C63] mt-0.5">
            Strictly capped at {MAX_STAFF_ACCOUNTS} authorized staff accounts (
            {staffMembers.length}/{MAX_STAFF_ACCOUNTS} slots assigned).
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          disabled={slotsRemaining === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          <span>
            {slotsRemaining > 0
              ? `Provision Staff (${slotsRemaining} left)`
              : 'All 6 Slots Assigned'}
          </span>
        </button>
      </div>

      {/* Staff slot grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STAFF_SLOT_NUMBERS.map((slotNum) => {
          const member = staffMembers.find((m) => m.slotNumber === slotNum);
          if (!member) {
            return (
              <div
                key={slotNum}
                className="border border-dashed border-[#CDC9BC] rounded-xl p-6 bg-[#F7F6F2]/60 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-mono text-[#6E6C63]">
                    Slot {slotNum} / {MAX_STAFF_ACCOUNTS}
                  </p>
                  <p className="text-sm font-medium text-[#3D3F3A] mt-1">
                    Unassigned Staff Seat
                  </p>
                  <p className="text-xs text-[#6E6C63] mt-0.5">
                    Authorize a Google account for villa management access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openAddModal}
                  className="px-3.5 py-2 text-xs font-medium text-[#183D2D] bg-white border border-[#E2DFD5] hover:bg-[#EEF3F0] rounded-lg"
                >
                  Assign Slot
                </button>
              </div>
            );
          }

          const isRootAdmin = member.email === SUPER_ADMIN_EMAIL;

          return (
            <div
              key={member.id}
              className="bg-white border border-[#E2DFD5] rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[#6E6C63] font-mono">
                    <span>Slot {member.slotNumber} / {MAX_STAFF_ACCOUNTS}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-[#183D2D]">
                      <Shield className="w-3 h-3" /> {member.role}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-[#1C2420] mt-1">
                    {member.name}
                  </h3>
                  <p className="text-xs font-mono text-[#3D3F3A] mt-0.5">{member.email}</p>
                  {member.phone && (
                    <p className="text-xs font-mono text-[#6E6C63] mt-0.5">{member.phone}</p>
                  )}
                  {member.whatsappPhone && (
                    <p className="text-xs font-mono text-[#6E6C63] mt-0.5">
                      WhatsApp: {member.whatsappPhone}
                    </p>
                  )}
                </div>
                <StatusBadge status={member.isActive ? 'Active' : 'Inactive'} />
              </div>

              <div className="pt-3 border-t border-[#E2DFD5] flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[#6E6C63] font-mono">
                  Last login: {formatColomboTimestamp(member.lastLoginAt)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(member)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#3D3F3A] bg-[#F7F6F2] hover:bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  {!isRootAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(member)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#3D3F3A] bg-[#F7F6F2] hover:bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg"
                      >
                        {member.isActive ? (
                          <>
                            <UserX className="w-3.5 h-3.5" /> Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" /> Activate
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(member)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Staff Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#E2DFD5] rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-start justify-between pb-3 border-b border-[#E2DFD5]">
              <div>
                <h3 className="text-base font-semibold text-[#1C2420]">
                  {editingStaff ? 'Edit Staff Account' : 'Provision Authorized Staff'}
                </h3>
                <p className="text-xs text-[#6E6C63]">
                  Only Google accounts listed here may sign in.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-[#6E6C63] hover:text-[#1C2420]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formErr && (
              <div className="mt-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-xs text-[#B91C1C]">
                {formErr}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                  Google Email Address
                </label>
                <input
                  type="email"
                  disabled={Boolean(editingStaff)}
                  placeholder="manager@gmail.com"
                  {...register('email')}
                  className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm disabled:bg-[#F7F6F2]"
                />
                {errors.email && (
                  <p className="text-xs text-[#B91C1C] mt-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="Staff member name"
                  {...register('name')}
                  className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm"
                />
                {errors.name && (
                  <p className="text-xs text-[#B91C1C] mt-1">{errors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Role</label>
                  <select
                    {...register('role')}
                    disabled={editingStaff?.email === SUPER_ADMIN_EMAIL}
                    className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm disabled:bg-[#F7F6F2]"
                  >
                    <option value="STAFF">STAFF</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                    Phone (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="+94 77 ..."
                    {...register('phone')}
                    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                  WhatsApp Number (international format)
                </label>
                <input
                  type="tel"
                  placeholder="+94771234567"
                  {...register('whatsappPhone')}
                  className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono"
                />
                {errors.whatsappPhone && (
                  <p className="text-xs text-[#B91C1C] mt-1">
                    {errors.whatsappPhone.message}
                  </p>
                )}
              </div>

              {editingStaff?.email !== SUPER_ADMIN_EMAIL && (
                <label className="flex items-center gap-2 text-xs font-medium text-[#1C2420] cursor-pointer">
                  <input type="checkbox" {...register('isActive')} className="rounded" />
                  Account Active
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-[#3D3F3A] bg-[#F7F6F2] border border-[#E2DFD5] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#183D2D] rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingStaff ? 'Save Changes' : 'Authorize Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove Authorized Staff"
        message={`Revoke access and remove ${deleteTarget?.email} from Slot ${deleteTarget?.slotNumber}?`}
        confirmLabel="Remove Access"
        danger
        loading={submitting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
};
