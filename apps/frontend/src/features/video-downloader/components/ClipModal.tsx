import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { parseTimeToSeconds, TIME_PATTERN } from "../model/time";

const clipSchema = z
  .object({
    startTime: z.string().regex(TIME_PATTERN),
    endTime: z.string().regex(TIME_PATTERN)
  })
  .superRefine((values, context) => {
    const startSeconds = parseTimeToSeconds(values.startTime);
    const endSeconds = parseTimeToSeconds(values.endTime);

    if (
      startSeconds === null ||
      endSeconds === null ||
      startSeconds >= endSeconds
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "invalidTimeRange",
        path: ["endTime"]
      });
    }
  });

type ClipSchema = z.infer<typeof clipSchema>;

interface ClipModalProps {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (values: ClipSchema) => Promise<void>;
}

export const ClipModal = ({
  open,
  loading,
  onClose,
  onConfirm
}: ClipModalProps) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<ClipSchema>({
    resolver: zodResolver(clipSchema),
    defaultValues: {
      startTime: "01:00",
      endTime: "01:50"
    }
  });

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm" />
      <div className="glass-panel relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-outline-variant/15 p-8 shadow-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="flex items-center gap-3 font-headline text-2xl text-white">
            <i className="bx bx-cut text-tertiary text-2xl" />
            {t("modalTitle")}
          </h2>
          <button
            type="button"
            className="text-on-surface-variant transition-colors hover:text-white"
            onClick={onClose}
            aria-label={t("close")}
          >
            <i className="bx bx-x text-2xl" />
          </button>
        </div>

        <form
          className="space-y-8"
          onSubmit={(event) => {
            void handleSubmit(onConfirm)(event);
          }}
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <label className="space-y-2">
              <span className="px-1 text-xs uppercase tracking-widest text-on-surface-variant">
                {t("modalStart")}
              </span>
              <input
                {...register("startTime")}
                className="w-full rounded-xl bg-surface-container-highest px-4 py-4 text-xl text-white outline-none ring-primary transition-all focus:ring-2"
                placeholder="01:00"
              />
            </label>
            <label className="space-y-2">
              <span className="px-1 text-xs uppercase tracking-widest text-on-surface-variant">
                {t("modalEnd")}
              </span>
              <input
                {...register("endTime")}
                className="w-full rounded-xl bg-surface-container-highest px-4 py-4 text-xl text-white outline-none ring-primary transition-all focus:ring-2"
                placeholder="01:50"
              />
            </label>
          </div>

          {errors.endTime?.message !== undefined && (
            <p className="text-sm text-error">{t(errors.endTime.message)}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-container py-5 text-lg font-bold text-on-primary-fixed shadow-[0_10px_20px_rgba(117,176,255,0.2)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="bx bx-download text-xl" />
            {loading ? t("loading") : t("modalConfirm")}
          </button>
        </form>
      </div>
    </div>
  );
};
