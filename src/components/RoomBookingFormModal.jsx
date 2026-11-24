import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, X } from "lucide-react";
import { roomBookingSchema } from "../utils/validation";
import { useAuth } from "../contexts/AuthContext";
import { useVillaData } from "../contexts/VillaDataContext";
import { useToast } from "../contexts/ToastContext";
import {
  addDaysToDateStr,
  findRoomBookingConflict,
  getColomboDateStr
} from "../utils/colomboTime";
import { createRoomBooking, updateRoomBooking } from "../services/villaService";
const RoomBookingFormModal = ({
  open,
  editingBooking,
  defaultRoomTypeId,
  onClose
}) => {
  const { buildActorContext } = useAuth();
  const {
    roomTypes,
    roomBookings,
    blockedSchedules,
    authorizedEmails,
    adminEmails
  } = useVillaData();
  const { notify } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [conflictMsg, setConflictMsg] = useState(null);
  const activeRooms = roomTypes.filter((r) => !r.isArchived);
  const firstAvailableRoom = activeRooms.find((r) => r.status === "Available") || activeRooms[0];
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(roomBookingSchema),
    defaultValues: {
      roomTypeId: defaultRoomTypeId || firstAvailableRoom?.id || "",
      customerName: "",
      customerPhone: "",
      foodStatus: "Included",
      checkInDate: getColomboDateStr(),
      checkInTime: "14:00",
      checkOutDate: addDaysToDateStr(getColomboDateStr(), 1),
      checkOutTime: "11:00",
      totalPayment: 0,
      advancePayment: 0,
      paymentMethod: "Bank Transfer",
      referenceNumber: "",
      specialNotes: "",
      status: "Pending"
    }
  });
  useEffect(() => {
    if (open) {
      setConflictMsg(null);
      if (editingBooking) {
        reset({
          roomTypeId: editingBooking.roomTypeId,
          customerName: editingBooking.customerName,
          customerPhone: editingBooking.customerPhone,
          foodStatus: editingBooking.foodStatus,
          checkInDate: editingBooking.checkInDate,
          checkInTime: editingBooking.checkInTime,
          checkOutDate: editingBooking.checkOutDate,
          checkOutTime: editingBooking.checkOutTime,
          totalPayment: editingBooking.totalPayment,
          advancePayment: editingBooking.advancePayment,
          paymentMethod: "Bank Transfer",
          referenceNumber: "",
          specialNotes: editingBooking.specialNotes || "",
          status: editingBooking.status
        });
      } else {
        const chosenId = defaultRoomTypeId || firstAvailableRoom?.id || "";
        const today = getColomboDateStr();
        reset({
          roomTypeId: chosenId,
          customerName: "",
          customerPhone: "",
          foodStatus: "Included",
          checkInDate: today,
          checkInTime: "14:00",
          checkOutDate: addDaysToDateStr(today, 1),
          checkOutTime: "11:00",
          totalPayment: 0,
          advancePayment: 0,
          paymentMethod: "Bank Transfer",
          referenceNumber: "",
          specialNotes: "",
          status: "Pending"
        });
      }
    }
  }, [open, editingBooking, defaultRoomTypeId, reset]);
  const wRoomTypeId = watch("roomTypeId");
  const wInDate = watch("checkInDate");
  const wInTime = watch("checkInTime");
  const wOutDate = watch("checkOutDate");
  const wOutTime = watch("checkOutTime");
  const wStatus = watch("status");
  const selectedRoom = activeRooms.find((r) => r.id === wRoomTypeId);
  const liveConflict = React.useMemo(() => {
    if (!open || !wRoomTypeId || !wInDate || !wOutDate || wStatus === "Cancelled") return null;
    if (selectedRoom && selectedRoom.status !== "Available" && !editingBooking) {
      return `Room "${selectedRoom.name}" is currently marked as ${selectedRoom.status}.`;
    }
    return findRoomBookingConflict({
      roomTypeId: wRoomTypeId,
      checkInDate: wInDate,
      checkInTime: wInTime,
      checkOutDate: wOutDate,
      checkOutTime: wOutTime,
      excludeId: editingBooking?.id,
      roomBookings,
      blocks: blockedSchedules
    });
  }, [
    open,
    wRoomTypeId,
    wInDate,
    wInTime,
    wOutDate,
    wOutTime,
    wStatus,
    selectedRoom,
    editingBooking,
    roomBookings,
    blockedSchedules
  ]);
  if (!open) return null;
  const onSubmit = async (values) => {
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor || !selectedRoom) return;
    if (values.status !== "Cancelled") {
      const conflict = findRoomBookingConflict({
        roomTypeId: values.roomTypeId,
        checkInDate: values.checkInDate,
        checkInTime: values.checkInTime,
        checkOutDate: values.checkOutDate,
        checkOutTime: values.checkOutTime,
        excludeId: editingBooking?.id,
        roomBookings,
        blocks: blockedSchedules
      });
      if (conflict) {
        setConflictMsg(conflict);
        return;
      }
    }
    setSubmitting(true);
    setConflictMsg(null);
    try {
      if (editingBooking) {
        await updateRoomBooking(actor, editingBooking, selectedRoom, {
          customerName: values.customerName,
          customerPhone: values.customerPhone,
          foodStatus: values.foodStatus,
          checkInDate: values.checkInDate,
          checkInTime: values.checkInTime,
          checkOutDate: values.checkOutDate,
          checkOutTime: values.checkOutTime,
          totalPayment: values.totalPayment,
          specialNotes: values.specialNotes,
          status: values.status
        });
        notify("Room booking updated", "success", editingBooking.bookingCode);
      } else {
        await createRoomBooking(actor, selectedRoom, {
          customerName: values.customerName,
          customerPhone: values.customerPhone,
          foodStatus: values.foodStatus,
          checkInDate: values.checkInDate,
          checkInTime: values.checkInTime,
          checkOutDate: values.checkOutDate,
          checkOutTime: values.checkOutTime,
          totalPayment: values.totalPayment,
          advancePayment: values.advancePayment,
          paymentMethod: values.paymentMethod,
          referenceNumber: values.referenceNumber,
          specialNotes: values.specialNotes,
          status: values.status
        });
        notify("Room reservation created", "success", `${selectedRoom.name} for ${values.customerName}`);
      }
      onClose();
    } catch (err) {
      setConflictMsg(err instanceof Error ? err.message : "Unable to save room reservation.");
    } finally {
      setSubmitting(false);
    }
  };
  const displayWarning = conflictMsg || liveConflict;
  return <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    role="dialog"
    aria-modal="true"
  >
      <div className="bg-white border border-[#E2DFD5] rounded-xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#E2DFD5]">
          <div>
            <h3 className="text-lg font-semibold text-[#1C2420]">
              {editingBooking ? `Edit Room Reservation \xB7 ${editingBooking.bookingCode}` : "New Room Reservation"}
            </h3>
            <p className="text-xs text-[#6E6C63] mt-0.5">
              Room availability is checked automatically for overlapping reservations.
            </p>
          </div>
          <button
    type="button"
    onClick={onClose}
    className="text-[#6E6C63] hover:text-[#1C2420] p-1 rounded"
    aria-label="Close"
  >
            <X className="w-4 h-4" />
          </button>
        </div>

        {displayWarning && <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#B91C1C]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{displayWarning}</span>
          </div>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Room Type</label>
              <select
    {...register("roomTypeId")}
    className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  >
                {activeRooms.map((r) => <option key={r.id} value={r.id}>
                    {r.roomCode} · {r.name}
                  </option>)}
              </select>
              {errors.roomTypeId && <p className="text-xs text-[#B91C1C] mt-1">{errors.roomTypeId.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Food Status</label>
              <select
    {...register("foodStatus")}
    className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  >
                <option value="Included">Included</option>
                <option value="Not Included">Not Included</option>
                <option value="Pending">Pending</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Reservation Status
              </label>
              <select
    {...register("status")}
    className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  >
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Checked-in">Checked-in</option>
                <option value="Checked-out">Checked-out</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Guest / Customer Name
              </label>
              <input
    type="text"
    placeholder="Guest full name"
    {...register("customerName")}
    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  />
              {errors.customerName && <p className="text-xs text-[#B91C1C] mt-1">{errors.customerName.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Phone Number
              </label>
              <input
    type="text"
    placeholder="+94 77 123 4567"
    {...register("customerPhone")}
    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
  />
              {errors.customerPhone && <p className="text-xs text-[#B91C1C] mt-1">{errors.customerPhone.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Check-in Date
              </label>
              <input
    type="date"
    {...register("checkInDate")}
    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
  />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Check-in Time
              </label>
              <input
    type="time"
    {...register("checkInTime")}
    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
  />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Check-out Date
              </label>
              <input
    type="date"
    {...register("checkOutDate")}
    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
  />
              {errors.checkOutDate && <p className="text-xs text-[#B91C1C] mt-1">{errors.checkOutDate.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Check-out Time
              </label>
              <input
    type="time"
    {...register("checkOutTime")}
    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
  />
            </div>
          </div>

          <input type="hidden" {...register("totalPayment")} />
          <input type="hidden" {...register("advancePayment")} />
          <input type="hidden" {...register("paymentMethod")} />
          <input type="hidden" {...register("referenceNumber")} />

          <div>
            <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
              Special Notes (optional)
            </label>
            <textarea
    rows={2}
    placeholder="Dietary preferences, early check-in request, airport transfer..."
    {...register("specialNotes")}
    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E2DFD5]">
            <button
    type="button"
    onClick={onClose}
    className="px-4 py-2 text-sm font-medium text-[#3D3F3A] bg-[#F7F6F2] hover:bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg transition-colors"
  >
              Cancel
            </button>
            <button
    type="submit"
    disabled={submitting || Boolean(liveConflict && wStatus !== "Cancelled")}
    className="px-5 py-2 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors disabled:opacity-50"
  >
              {submitting ? "Saving..." : editingBooking ? "Save Changes" : "Create Reservation"}
            </button>
          </div>
        </form>
      </div>
    </div>;
};
export {
  RoomBookingFormModal
};
