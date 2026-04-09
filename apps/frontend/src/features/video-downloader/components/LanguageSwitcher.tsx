import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const languages = [
  { code: "az", label: "AZ", name: "Azərbaycanca" },
  { code: "en", label: "EN", name: "English" },
  { code: "tr", label: "TR", name: "Türkçe" },
  { code: "ru", label: "RU", name: "Русский" }
] as const;

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selectedLanguage =
    languages.find((language) => i18n.language.startsWith(language.code)) ??
    languages[0];

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent): void => {
      if (
        wrapperRef.current !== null &&
        event.target instanceof Node &&
        !wrapperRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("click", onDocumentClick);
    return () => {
      document.removeEventListener("click", onDocumentClick);
    };
  }, []);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:border-primary/40 dark:border-outline-variant/30 dark:bg-surface-container-low dark:text-on-surface"
        onClick={() => {
          setOpen((previous) => !previous);
        }}
      >
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <i className="bx bx-globe text-base" />
          </span>
          <span className="block font-semibold leading-tight">{selectedLanguage.name}</span>
        </span>
        <i className={`bx bx-chevron-${open ? "up" : "down"} text-lg`} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full overflow-hidden rounded-md border border-slate-300 bg-white p-2 shadow-2xl dark:border-outline-variant/30 dark:bg-surface-container-high">
          <div className="max-h-56 space-y-1 overflow-y-auto">
          {languages.map((language) => (
            <button
              key={language.code}
              type="button"
              onClick={() => {
                void i18n.changeLanguage(language.code);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                i18n.language.startsWith(language.code)
                  ? "bg-primary/10 text-primary"
                  : "text-slate-700 hover:bg-slate-100 dark:text-on-surface dark:hover:bg-surface-container-highest"
              }`}
            >
              <span className="font-medium">{language.name}</span>
              {i18n.language.startsWith(language.code) && (
                <i className="bx bx-check text-sm" />
              )}
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  );
};
