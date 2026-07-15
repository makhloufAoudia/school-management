// Alertes style SweetAlert, sans dépendance externe.
// API : alertError(title, text?) et confirmDelete(title, confirmText, cancelText)

function isDark() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

type DialogOptions = {
  icon: "error" | "warning";
  title: string;
  text?: string;
  confirmText: string;
  confirmColor: string;
  cancelText?: string;
};

function showDialog(opts: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dark = isDark();
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);opacity:0;transition:opacity .15s";

    const box = document.createElement("div");
    box.style.cssText = `width:min(26rem,90vw);border-radius:1rem;padding:2rem 1.5rem 1.5rem;text-align:center;transform:scale(.9);transition:transform .15s;box-shadow:0 20px 60px rgba(0,0,0,.3);background:${
      dark ? "#0f172a" : "#ffffff"
    };color:${dark ? "#f1f5f9" : "#0f172a"};font-family:inherit`;

    const iconColor = opts.icon === "error" ? "#ef4444" : "#f59e0b";
    const iconChar = opts.icon === "error" ? "✕" : "!";
    const icon = document.createElement("div");
    icon.textContent = iconChar;
    icon.style.cssText = `margin:0 auto 1rem;display:flex;align-items:center;justify-content:center;width:4.5rem;height:4.5rem;border-radius:9999px;border:3px solid ${iconColor};color:${iconColor};font-size:2rem;font-weight:700`;

    const title = document.createElement("h2");
    title.textContent = opts.title;
    title.style.cssText = "margin:0 0 .5rem;font-size:1.25rem;font-weight:700";

    const buttons = document.createElement("div");
    buttons.style.cssText =
      "display:flex;gap:.5rem;justify-content:center;margin-top:1.25rem";

    function close(result: boolean) {
      overlay.style.opacity = "0";
      box.style.transform = "scale(.9)";
      setTimeout(() => overlay.remove(), 150);
      resolve(result);
    }

    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = opts.confirmText;
    confirmBtn.style.cssText = `border:none;border-radius:.5rem;padding:.55rem 1.4rem;font-size:.9rem;font-weight:600;color:#fff;cursor:pointer;background:${opts.confirmColor}`;
    confirmBtn.onclick = () => close(true);
    buttons.appendChild(confirmBtn);

    if (opts.cancelText) {
      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = opts.cancelText;
      cancelBtn.style.cssText = `border:1px solid ${
        dark ? "#475569" : "#cbd5e1"
      };border-radius:.5rem;padding:.55rem 1.4rem;font-size:.9rem;font-weight:600;cursor:pointer;background:transparent;color:inherit`;
      cancelBtn.onclick = () => close(false);
      buttons.appendChild(cancelBtn);
    }

    box.appendChild(icon);
    box.appendChild(title);
    if (opts.text) {
      const text = document.createElement("p");
      text.textContent = opts.text;
      text.style.cssText = `margin:0;font-size:.9rem;color:${
        dark ? "#94a3b8" : "#64748b"
      }`;
      box.appendChild(text);
    }
    box.appendChild(buttons);
    overlay.appendChild(box);
    overlay.onclick = (e) => {
      if (e.target === overlay) close(false);
    };
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
      box.style.transform = "scale(1)";
    });
    confirmBtn.focus();
  });
}

export function alertError(title: string, text?: string) {
  return showDialog({
    icon: "error",
    title,
    text,
    confirmText: "OK",
    confirmColor: "#4f46e5",
  });
}

export function confirmDelete(
  title: string,
  confirmText: string,
  cancelText: string
): Promise<boolean> {
  return showDialog({
    icon: "warning",
    title,
    confirmText,
    confirmColor: "#dc2626",
    cancelText,
  });
}
