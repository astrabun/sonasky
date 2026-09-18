import { useRef, useState } from "react";
import { Button } from "../../../../components/ui/Button";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "../../../../components/ui/Dialog";
import { IconButton } from "../../../../components/ui/IconButton";
import { TextField } from "../../../../components/ui/TextField";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useDrag, useDrop } from "react-dnd";
import {
  ALLOWED_LINK_TYPES,
  type CharacterLink,
  type CharacterLinkType,
  LINK_TYPE_HINTS,
  LINK_TYPE_LABELS,
  validateCharacterLink,
} from "../../../../types/characterLinks";

const LINK_ITEM_TYPE = "LINK";

interface DraggableLinkItemProps {
  link: CharacterLink;
  index: number;
  moveLink: (from: number, to: number) => void;
  isEditing: boolean;
  editType: CharacterLinkType | "";
  typeError: string;
  editUrl: string;
  urlError: string;
  onStartEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditTypeChange: (type: CharacterLinkType | "") => void;
  onEditUrlChange: (url: string) => void;
  editLabel: string;
  onEditLabelChange: (label: string) => void;
}

function DraggableLinkItem({
  link,
  index,
  moveLink,
  isEditing,
  editType,
  typeError,
  editUrl,
  urlError,
  onStartEdit,
  onDelete,
  onSaveEdit,
  onCancelEdit,
  onEditTypeChange,
  onEditUrlChange,
  editLabel,
  onEditLabelChange,
}: DraggableLinkItemProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, dragPreview] = useDrag({
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    item: { index },
    type: LINK_ITEM_TYPE,
  });

  const [, drop] = useDrop({
    accept: LINK_ITEM_TYPE,
    hover(item: { index: number }) {
      if (!rowRef.current) {
        return;
      }
      if (item.index === index) {
        return;
      }
      moveLink(item.index, index);
      item.index = index;
    },
  });

  dragPreview(drop(rowRef));
  drag(handleRef);

  return (
    <div
      ref={rowRef}
      className="flex items-start gap-2 border-b border-gray-200 p-2 dark:border-gray-700"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <div
        ref={handleRef}
        className={`flex cursor-grab items-center ${isEditing ? "mt-1" : "mt-2"}`}
      >
        <GripVertical size={20} />
      </div>
      {isEditing ? (
        <div className="flex flex-1 flex-col gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium">Link Type</label>
            <select
              value={editType}
              onChange={(e) => onEditTypeChange(e.target.value as CharacterLinkType | "")}
              className={`w-40 rounded-md border px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-gray-900 ${
                typeError ? "border-red-500" : "border-gray-300 dark:border-gray-600"
              }`}
            >
              <option value="" disabled>
                Select a type...
              </option>
              {ALLOWED_LINK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LINK_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {typeError && <p className="mt-1 text-xs text-red-600">{typeError}</p>}
          </div>
          <TextField
            label="URL"
            value={editUrl}
            onChange={(e) => onEditUrlChange(e.target.value)}
            helperText={urlError || (editType ? LINK_TYPE_HINTS[editType] : "")}
            className={urlError ? "[&_input]:border-red-500" : ""}
          />
          <TextField
            label="Label (optional)"
            value={editLabel}
            onChange={(e) => onEditLabelChange(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="small" variant="contained" onClick={onSaveEdit}>
              Save
            </Button>
            <Button size="small" variant="text" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onStartEdit(index)}>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {LINK_TYPE_LABELS[link.type]}
              {link.label ? ` - ${link.label}` : ""}
            </p>
            <p className="overflow-hidden text-ellipsis whitespace-nowrap">{link.url}</p>
          </div>
          <IconButton size="small" onClick={() => onStartEdit(index)}>
            <Pencil size={16} />
          </IconButton>
          <IconButton size="small" onClick={() => onDelete(index)}>
            <Trash2 size={16} />
          </IconButton>
        </>
      )}
    </div>
  );
}

interface LinksDialogProps {
  open: boolean;
  onClose: () => void;
  links: CharacterLink[];
  onLinksChange: (links: CharacterLink[]) => void;
}

function LinksDialog({ open, onClose, links, onLinksChange }: LinksDialogProps) {
  const [editingIndex, setEditingIndex] = useState<number | undefined>();
  const [isEditNew, setIsEditNew] = useState(false);
  const [editType, setEditType] = useState<CharacterLinkType | "">("");
  const [editUrl, setEditUrl] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [typeError, setTypeError] = useState("");
  const [urlError, setUrlError] = useState("");

  const clearErrors = () => {
    setTypeError("");
    setUrlError("");
  };

  const trySaveCurrentEdit = (currentLinks: CharacterLink[]): CharacterLink[] | undefined => {
    if (editingIndex === undefined) {
      return currentLinks;
    }
    if (!editType) {
      setTypeError("Please select a link type");
      return undefined;
    }
    const link: CharacterLink = {
      type: editType,
      url: editUrl,
      ...(editLabel ? { label: editLabel } : {}),
    };
    if (!validateCharacterLink(link)) {
      setUrlError(`Invalid URL. ${LINK_TYPE_HINTS[editType]}`);
      return undefined;
    }
    const updated = [...currentLinks];
    updated[editingIndex] = link;
    return updated;
  };

  const handleSaveEdit = () => {
    const updated = trySaveCurrentEdit(links);
    if (!updated) {
      return;
    }
    onLinksChange(updated);
    setEditingIndex(undefined);
    setIsEditNew(false);
    clearErrors();
  };

  const handleCancelEdit = () => {
    if (isEditNew && editingIndex !== undefined) {
      onLinksChange(links.filter((_, i) => i !== editingIndex));
    }
    setEditingIndex(undefined);
    setIsEditNew(false);
    setEditLabel("");
    clearErrors();
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditType(links[index].type);
    setEditUrl(links[index].url);
    setEditLabel(links[index].label ?? "");
    setIsEditNew(false);
    clearErrors();
  };

  const handleAdd = () => {
    let baseLinks = links;
    if (editingIndex !== undefined) {
      const saved = trySaveCurrentEdit(links);
      if (!saved) {
        return;
      }
      baseLinks = saved;
      onLinksChange(baseLinks);
    }
    const newIndex = baseLinks.length;
    onLinksChange([...baseLinks, { type: ALLOWED_LINK_TYPES[0], url: "" }]);
    setEditingIndex(newIndex);
    setIsEditNew(true);
    setEditType("");
    setEditUrl("");
    setEditLabel("");
    clearErrors();
  };

  const handleDelete = (index: number) => {
    onLinksChange(links.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(undefined);
      setIsEditNew(false);
      clearErrors();
    } else if (editingIndex !== undefined && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  };

  const handleDone = () => {
    const saved = trySaveCurrentEdit(links);
    if (!saved) {
      return;
    }
    if (editingIndex !== undefined) {
      onLinksChange(saved);
    }
    setEditingIndex(undefined);
    setIsEditNew(false);
    clearErrors();
    onClose();
  };

  const handleDialogClose = () => {
    if (isEditNew && editingIndex !== undefined) {
      onLinksChange(links.filter((_, i) => i !== editingIndex));
    }
    setEditingIndex(undefined);
    setIsEditNew(false);
    clearErrors();
    onClose();
  };

  const moveLink = (dragIndex: number, hoverIndex: number) => {
    const updated = [...links];
    const [dragged] = updated.splice(dragIndex, 1);
    updated.splice(hoverIndex, 0, dragged);
    onLinksChange(updated);
    if (editingIndex === dragIndex) {
      setEditingIndex(hoverIndex);
    } else if (editingIndex !== undefined) {
      if (editingIndex > dragIndex && editingIndex <= hoverIndex) {
        setEditingIndex(editingIndex - 1);
      } else if (editingIndex < dragIndex && editingIndex >= hoverIndex) {
        setEditingIndex(editingIndex + 1);
      }
    }
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} maxWidth="sm">
      <DialogTitle>Manage Links</DialogTitle>
      <DialogContent>
        {links.length === 0 && (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
            No links added yet. Click "Add Link" to get started.
          </p>
        )}
        {links.map((link, index) => (
          <DraggableLinkItem
            key={index}
            link={link}
            index={index}
            moveLink={moveLink}
            isEditing={editingIndex === index}
            editType={editType}
            typeError={typeError}
            editUrl={editUrl}
            urlError={urlError}
            onStartEdit={handleStartEdit}
            onDelete={handleDelete}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onEditTypeChange={setEditType}
            onEditUrlChange={setEditUrl}
            editLabel={editLabel}
            onEditLabelChange={setEditLabel}
          />
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleAdd} variant="outlined" className="mr-auto">
          Add Link
        </Button>
        <Button onClick={handleDone} color="primary" variant="contained">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default LinksDialog;
