import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { roomTypeSchema } from "../utils/validation";
import { useAuth } from "../contexts/AuthContext";
import { useVillaData } from "../contexts/VillaDataContext";
import { useToast } from "../contexts/ToastContext";
import { createRoomType, updateRoomType } from "../services/villaService";
const RoomTypeFormModal = ({
  open,
  editingRoomType,
  onClose
}) => {
  const { buildActorContext } = useAuth();
  const { authorizedEmails, adminEmails } = useVillaData();
  const { notify } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(roomTypeSchema),
    defaultValues: {
      roomCode: "",
      name: "",
      description: "",
      maxCapacity: 2,
      price: 0,
      status: "Available",
      imageUrl: "/src/assets/images/room_garden_suite_1795247325311.jpg"
    }
  });
  useEffect(() => {
    if (open) {
      setErrorMsg(null);
      if (editingRoomType) {
        reset({
          roomCode: editingRoomType.roomCode,
          name: editingRoomType.name,
          description: editingRoomType.description,
          maxCapacity: editingRoomType.maxCapacity,
          price: editingRoomType.price,
          status: editingRoomType.status,
          imageUrl: editingRoomType.imageUrl || ""
        });
      } else {
        reset({
          roomCode: "",
          name: "",
          description: "",
          maxCapacity: 2,
          price: 0,
          status: "Available",
          imageUrl: "/src/assets/images/room_garden_suite_1795247325311.jpg"
        });
      }
    }
  }, [open, editingRoomType, reset]);
  if (!open) return null;
  const onSubmit = async (values) => {
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (editingRoomType) {
        await updateRoomType(actor, editingRoomType, values);
        notify("Room type updated", "success", values.name);
      } else {
        await createRoomType(actor, values);
        notify("Room type created", "success", values.name);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to save room type.");
    } finally {
      setSubmitting(false);
    }
  };
  return <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    role="dialog"
    aria-modal="true"
  >
      <div className="bg-white border border-[#E2DFD5] rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#E2DFD5]">
          <div>
            <h3 className="text-lg font-semibold text-[#1C2420]">
              {editingRoomType ? `Edit Room \xB7 ${editingRoomType.roomCode}` : "Add Room Type"}
            </h3>
            <p className="text-xs text-[#6E6C63] mt-0.5">
              Define suite details, capacity, and availability status.
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

        {errorMsg && <div className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#B91C1C]">
            {errorMsg}
          </div>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <input type="hidden" {...register("price")} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Room Code</label>
              <input
    type="text"
    placeholder="RM-04"
    {...register("roomCode")}
    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#183D2D]"
  />
              {errors.roomCode && <p className="text-xs text-[#B91C1C] mt-1">{errors.roomCode.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Room Name</label>
              <input
    type="text"
    placeholder="Canopy Terrace Suite"
    {...register("name")}
    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  />
              {errors.name && <p className="text-xs text-[#B91C1C] mt-1">{errors.name.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
                Max Capacity
              </label>
              <input
    type="number"
    min={1}
    {...register("maxCapacity")}
    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:border-[#183D2D]"
  />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#3D3F3A] mb-1">Status</label>
              <select
    {...register("status")}
    className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  >
                <option value="Available">Available</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
              Room Description
            </label>
            <textarea
    rows={3}
    placeholder="Architectural features, view, amenities..."
    {...register("description")}
    className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
              Suite Photography Preset
            </label>
            <select
    {...register("imageUrl")}
    className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#183D2D]"
  >
              <option value="/src/assets/images/room_master_pavilion_1795247324196.jpg">
                Master Pavilion Suite
              </option>
              <option value="/src/assets/images/room_garden_suite_1795247325311.jpg">
                Royal Garden Suite
              </option>
              <option value="/src/assets/images/room_poolside_cabana_1795247324983.jpg">
                Emerald Poolside Cabana
              </option>
              <option value="">No image</option>
            </select>
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
    disabled={submitting}
    className="px-5 py-2 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors disabled:opacity-50"
  >
              {submitting ? "Saving..." : editingRoomType ? "Save Changes" : "Add Room Type"}
            </button>
          </div>
        </form>
      </div>
    </div>;
};
export {
  RoomTypeFormModal
};
