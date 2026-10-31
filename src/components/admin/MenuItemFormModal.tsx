// ════════════════════════════════════════════════════════════════════════════
//  MenuItemFormModal — create / edit an item + quick-edit its modifiers.
//  One row per action; refetch happens after close (no optimistic menu cache).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { formatPrice } from '../../lib/utils';
import * as api from '../../lib/api';
import type { CategoryRow, ItemModifierRow } from '../../types/database';
import type { MenuItemView } from '../../types/models';

interface MenuItemFormModalProps {
  item: MenuItemView | null; // null → create mode
  restaurantId: string;
  categories: CategoryRow[];
  modifierRows: ItemModifierRow[]; // raw rows of *this item* (create mode: [])
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  category_id: string;
  name: string;
  description: string;
  price: string;
  image_url: string;
  dietary_tags: string;
}

export function MenuItemFormModal({ item, restaurantId, categories, modifierRows, onClose, onSaved }: MenuItemFormModalProps) {
  const isEdit = item !== null;
  const [form, setForm] = useState<FormState>({
    category_id: '',
    name: '',
    description: '',
    price: '',
    image_url: '',
    dietary_tags: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modifier quick-edit (only meaningful in edit mode)
  const [modGroup, setModGroup] = useState('');
  const [modOption, setModOption] = useState('');
  const [modPrice, setModPrice] = useState('0');
  const [modRequired, setModRequired] = useState(false);

  useEffect(() => {
    setForm({
      category_id: item?.category_id ?? categories[0]?.id ?? '',
      name: item?.name ?? '',
      description: item?.description ?? '',
      price: item ? item.price.toString() : '',
      image_url: item?.image_url ?? '',
      dietary_tags: item?.dietary_tags.join(', ') ?? '',
    });
  }, [item, categories]);

  const modsForItem = useMemo(
    () => (item ? modifierRows.filter((m) => m.menu_item_id === item.id) : []),
    [item, modifierRows],
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (form.name.trim() === '') throw new Error('Name is required');
      const price = Number(form.price);
      if (!Number.isFinite(price) || price < 0) throw new Error('Price must be a positive amount');
      const tags = form.dietary_tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      if (item) {
        await api.updateMenuItem(item.id, {
          category_id: form.category_id || item.category_id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: form.price,
          image_url: form.image_url.trim() || null,
          dietary_tags: tags,
        });
      } else {
        if (!form.category_id) throw new Error('Choose a category');
        await api.insertMenuItem({
          restaurant_id: restaurantId,
          category_id: form.category_id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: form.price,
          image_url: form.image_url.trim() || null,
          dietary_tags: tags,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const addModifier = async () => {
    if (!item || !modGroup.trim() || !modOption.trim()) return;
    const price = Number(modPrice);
    await api.insertModifier({
      menu_item_id: item.id,
      group_name: modGroup.trim(),
      option_name: modOption.trim(),
      additional_price: (Number.isFinite(price) ? price : 0).toFixed(2),
      is_required: modRequired,
    });
    setModGroup('');
    setModOption('');
    setModPrice('0');
    setModRequired(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${item?.name}` : 'New menu item'} footer={
      <Button block size="lg" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save item'}
      </Button>
    }>
      <div className="space-y-3.5 px-5 py-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}

        <Field label="Name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputCls}
            placeholder="Guinness Beef Stew"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className={inputCls}
            placeholder="Slow-braised with root veg…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (€)">
            <input
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value.replace(',', '.') })}
              inputMode="decimal"
              className={inputCls}
              placeholder="15.50"
            />
          </Field>
          <Field label="Category">
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className={inputCls}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Image URL (Unsplash etc. — stays out of Supabase Storage)">
          <input
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            className={inputCls}
            placeholder="https://images.unsplash.com/photo-…"
          />
        </Field>

        <Field label="Dietary tags (comma separated)">
          <input
            value={form.dietary_tags}
            onChange={(e) => setForm({ ...form, dietary_tags: e.target.value })}
            className={inputCls}
            placeholder="vegetarian, gluten-free"
          />
        </Field>

        {isEdit && item && (
          <div className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <p className="text-[11px] font-black uppercase tracking-widest text-stone-400">Modifier options</p>
            {modsForItem.length === 0 && <p className="mt-1 text-xs text-stone-400">None yet.</p>}
            <ul className="mt-1.5 space-y-1">
              {modsForItem.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-stone-200">
                  <span className="min-w-0 truncate">
                    <strong>{m.group_name}:</strong> {m.option_name}{' '}
                    <em className="not-italic font-semibold text-emerald-700">
                      {m.additional_price !== '0.00' ? `+${formatPrice(m.additional_price)}` : 'free'}
                    </em>{' '}
                    {m.is_required && <span className="font-bold text-amber-700">• required</span>}
                  </span>
                  <button
                    onClick={async () => {
                      await api.deleteModifier(m.id);
                      onSaved();
                    }}
                    className="shrink-0 text-stone-400 hover:text-red-600"
                    aria-label={`Remove option ${m.option_name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <input value={modGroup} onChange={(e) => setModGroup(e.target.value)} className={inputCls} placeholder="Group (e.g. Extras)" />
              <input value={modOption} onChange={(e) => setModOption(e.target.value)} className={inputCls} placeholder="Option (e.g. Extra cheese)" />
              <input value={modPrice} onChange={(e) => setModPrice(e.target.value.replace(',', '.'))} className={inputCls} inputMode="decimal" placeholder="Price (0)" />
              <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
                <input type="checkbox" checked={modRequired} onChange={(e) => setModRequired(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                Required
              </label>
            </div>
            <Button size="sm" variant="secondary" className="mt-2" onClick={addModifier} disabled={!modGroup.trim() || !modOption.trim()}>
              + Add option
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

const inputCls =
  'w-full rounded-xl bg-white px-3 py-2 text-sm text-stone-900 ring-1 ring-stone-300 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-widest text-stone-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default MenuItemFormModal;
