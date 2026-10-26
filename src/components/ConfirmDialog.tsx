'use client';

import { Modal } from './Modal';

interface Props {
  title: string;
  message: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, busy, onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{message}</p>
      <div className="modal-actions">
        <button type="button" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="danger" onClick={onConfirm} disabled={busy}>
          삭제
        </button>
      </div>
    </Modal>
  );
}
