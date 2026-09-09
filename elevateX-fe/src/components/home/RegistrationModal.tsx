'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { fetchRegistrationFee, registerParticipant, type RegistrationPayload, type RegistrationResult } from '@/lib/api';
import styles from './RegistrationModal.module.css';

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const allowedFileTypes = ['image/jpeg', 'image/png', 'image/webp'];
const phoneRegex = /^[0-9+\s()-]{8,20}$/;

const participantSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name cannot exceed 50 characters'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().min(8, 'Phone number must be at least 8 digits').regex(phoneRegex, 'Enter a valid phone number'),
  trackId: z.string().min(1, 'Please select a track'),
});

interface FormData {
  name: string;
  email: string;
  phone: string;
  trackId: string;
}

interface Errors {
  [key: string]: string;
}

// ElevateX is no longer track-based, but the existing registration API/DB
// still require a valid trackId per the current backend contract. This value
// is sent automatically and is not shown to the user.
const DEFAULT_TRACK_ID = 'open-innovation';

const STEPS = ['Participant Details', 'Payment & Review'];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className={styles.stepper} role="list" aria-label="Registration steps">
      {STEPS.map((step, i) => (
        <div key={step} className={styles.stepItem} role="listitem">
          <div className={styles.step}>
            <div
              className={clsx(
                styles.stepCircle,
                i < currentStep ? styles.stepCircleComplete : i === currentStep ? styles.stepCircleActive : undefined,
              )}
              aria-current={i === currentStep ? 'step' : undefined}
            >
              {i < currentStep ? <CheckCircle size={16} /> : i + 1}
            </div>
            <span className={clsx(styles.stepName, i === currentStep && styles.stepNameActive)}>{step}</span>
          </div>
          {i < STEPS.length - 1 && <div className={clsx(styles.connector, i < currentStep && styles.connectorComplete)} aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
}

function ParticipantDetails({ data, errors, onChange }: { data: FormData; errors: Errors; onChange: (field: keyof FormData, value: string) => void }) {
  return (
    <div className={styles.formStep}>
      <Input id="participantName" label="Full Name" placeholder="Your full name" value={data.name} onChange={(e) => onChange('name', e.target.value)} error={errors.name} autoFocus maxLength={50} />
      <Input id="participantEmail" label="Email" type="email" placeholder="you@example.com" value={data.email} onChange={(e) => onChange('email', e.target.value)} error={errors.email} />
      <Input id="participantPhone" label="Phone Number" type="tel" placeholder="+91 98765 43210" value={data.phone} onChange={(e) => onChange('phone', e.target.value)} error={errors.phone} />
    </div>
  );
}

function PaymentReview({ data, fee, paymentFile, errors, onFileChange, onSubmit, isSubmitting }: {
  data: FormData;
  fee: number;
  paymentFile: File | null;
  errors: Errors;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  return (
    <div className={styles.reviewStep}>
      <div className={styles.paymentSummary}>
        <div className={styles.summaryRow}>
          <span>Registration Fee</span>
          <strong>₹{fee}</strong>
        </div>
        <div className={styles.summaryRowTotal}>
          <span>Total Amount Payable</span>
          <strong>₹{fee}</strong>
        </div>
      </div>

      <div className={styles.qrBlock}>
        <p className={styles.qrTitle}>Payment</p>
        <p className={styles.helper}>Scan the QR code below using Google Pay and complete the payment.</p>
        <img src="/images/elevateXpic.jpeg" alt="Google Pay QR code"  width={250} height={250}  className={styles.qrImage}/>
      </div>

      <div className={styles.uploadBlock}>
        <label htmlFor="paymentScreenshot" className={styles.fieldLabel}>Upload Payment Screenshot</label>
        <input id="paymentScreenshot" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={onFileChange} className={styles.fileInput} />
        {paymentFile ? <p className={styles.fileName}>{paymentFile.name}</p> : <p className={styles.helper}>A payment screenshot is required before submission.</p>}
        {errors.paymentScreenshot && <p role="alert" className={styles.error}>⚠ {errors.paymentScreenshot}</p>}
      </div>

      <div className={styles.reviewCard}>
        <Row label="Name" value={data.name} />
        <Row label="Email" value={data.email} />
        <Row label="Phone" value={data.phone} />
      </div>

      <Button variant="primary" size="sm" onClick={onSubmit} isLoading={isSubmitting} disabled={isSubmitting} rightIcon={!isSubmitting ? <CheckCircle size={16} /> : undefined}>
        {isSubmitting ? 'Registering…' : 'Submit Registration'}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reviewRow}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value}</span>
    </div>
  );
}

interface RegistrationModalProps { isOpen: boolean; onClose: () => void; }

export default function RegistrationModal({ isOpen, onClose }: RegistrationModalProps) {
  const { addToast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [fee, setFee] = useState(0);
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedRegistration, setSubmittedRegistration] = useState<RegistrationResult | null>(null);
  const [formData, setFormData] = useState<FormData>({ name: '', email: '', phone: '', trackId: DEFAULT_TRACK_ID });

  useEffect(() => {
    if (isOpen) {
      fetchRegistrationFee().then((currentFee) => setFee(Number(currentFee) || 0)).catch(() => {
        setFee(0);
        addToast('Unable to load the registration fee. Please try again.', 'error');
      });
      dialogRef.current?.focus();
    }
  }, [addToast, isOpen]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') onClose();
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: () => registerParticipant({
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      trackId: formData.trackId,
    } satisfies RegistrationPayload, paymentFile),
    onSuccess: (result) => {
      if (result.success) {
        setSubmittedRegistration(result);
        setIsSubmitted(true);
        addToast(result.message || 'Registration submitted successfully.', 'success', 6000);
      } else {
        addToast(result.message, 'error');
      }
    },
    onError: () => addToast('Registration failed. Please try again.', 'error'),
  });

  function resetForm() {
    setStep(0);
    setErrors({});
    setPaymentFile(null);
    setSubmittedRegistration(null);
    setIsSubmitted(false);
    setFormData({ name: '', email: '', phone: '', trackId: DEFAULT_TRACK_ID });
  }

  function handleFieldChange(field: keyof FormData, value: string) {
    setFormData((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: '' }));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setPaymentFile(null);
      return;
    }
    if (!allowedFileTypes.includes(file.type)) {
      setPaymentFile(null);
      setErrors((previous) => ({ ...previous, paymentScreenshot: 'Upload a JPG, JPEG, PNG, or WEBP image.' }));
      event.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setPaymentFile(null);
      setErrors((previous) => ({ ...previous, paymentScreenshot: 'Payment screenshot must be 2 MB or smaller.' }));
      event.target.value = '';
      return;
    }
    setPaymentFile(file);
    setErrors((previous) => ({ ...previous, paymentScreenshot: '' }));
  }

  function validateStep(): boolean {
    const newErrors: Errors = {};
    if (step === 0) {
      const result = participantSchema.safeParse(formData);
      if (!result.success) {
        result.error.issues.forEach((issue) => { newErrors[issue.path[0] as string] = issue.message; });
      }
    } else if (!paymentFile) {
      newErrors.paymentScreenshot = 'A payment screenshot is required.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleNext() {
    if (validateStep()) setStep((current) => current + 1);
  }

  function handleBack() {
    setStep((current) => current - 1);
    setErrors({});
  }

  function handleSubmit() {
    if (!validateStep() || !fee) return;
    mutation.mutate();
  }

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} onKeyDown={handleKeyDown} className={styles.dialog}>
        {!isSubmitted ? (
          <>
            <div className={styles.header}>
              <div>
                <h2 id="modal-title" className={styles.title}>Individual Registration</h2>
                <p className={styles.stepLabel}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
              </div>
              <button onClick={onClose} aria-label="Close registration modal" className={styles.iconButton}><X size={20} /></button>
            </div>

            <StepIndicator currentStep={step} />

            <div className={styles.stepContent}>
              {step === 0 && <ParticipantDetails data={formData} errors={errors} onChange={handleFieldChange} />}
              {step === 1 && <PaymentReview data={formData} fee={fee} paymentFile={paymentFile} errors={errors} onFileChange={handleFileChange} onSubmit={handleSubmit} isSubmitting={mutation.isPending} />}
            </div>

            <div className={styles.footer}>
              {step > 0 ? <Button variant="ghost" size="sm" onClick={handleBack} leftIcon={<ChevronLeft size={16} />} disabled={mutation.isPending}>Back</Button> : <div />}
              {step < STEPS.length - 1 ? <Button variant="primary" size="sm" onClick={handleNext} rightIcon={<ChevronRight size={16} />}>Continue</Button> : <div />}
            </div>
          </>
        ) : (
          <div className={styles.successState}>
            <div className={styles.successIcon}><CheckCircle size={36} /></div>
            <h2 className={styles.successTitle}>Registration over. Verification pending. You may exit.</h2>
            <div className={styles.successCard}>
              <p><strong>Name:</strong> {formData.name}</p>
              <p><strong>Registration ID:</strong> {submittedRegistration?.registrationId || '—'}</p>
              <p><strong>Registration Amount:</strong> ₹{submittedRegistration?.registration?.totalRegistrationFee ?? fee}</p>
              <p><strong>Status:</strong> Pending Verification</p>
            </div>
            <Button variant="primary" onClick={() => { resetForm(); onClose(); }}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}
