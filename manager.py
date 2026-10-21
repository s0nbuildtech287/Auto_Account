# -*- coding: utf-8 -*-
"""
manager.py — GUI quan ly accounts + chay tool doi mat khau
Dung: python manager.py
"""
import tkinter as tk
from tkinter import ttk, messagebox
import csv
import os
import re
import subprocess
import threading
import json
from datetime import datetime

CSV_FILE     = os.path.join(os.path.dirname(__file__), "accounts.csv")
RESULTS_FILE = os.path.join(os.path.dirname(__file__), "results.json")

# ── Color palette (modern dark) ───────────────────────────────────────────────
BG_DARK    = "#0f0f1a"   # nen cung nhat
BG         = "#161624"   # nen chinh
BG_CARD    = "#1c1c2e"   # card panel
BG_INPUT   = "#222236"   # input field
BG_HOVER   = "#2a2a42"

ACCENT     = "#6c5ce7"   # chu dao - tim
ACCENT_LT  = "#a29bfe"   # tim nhat
ACCENT_DK  = "#5346c4"   # tim dam

SUCCESS    = "#00d68f"   # xanh la
SUCCESS_DK = "#00b377"
DANGER     = "#ff6b6b"   # do
DANGER_DK  = "#e85555"
WARNING    = "#feca57"   # vang
INFO       = "#54a0ff"   # xanh duong

TEXT       = "#e8e8f0"
TEXT2      = "#8888a8"
TEXT3      = "#5a5a7a"
BORDER     = "#2e2e44"
BORDER_LT  = "#3a3a55"

# ── Fonts ──────────────────────────────────────────────────────────────────────
F_H1     = ("Segoe UI Semibold", 15)
F_H2     = ("Segoe UI Semibold", 11)
F_BODY   = ("Segoe UI", 10)
F_BODY_B = ("Segoe UI Semibold", 10)
F_SMALL  = ("Segoe UI", 9)
F_TINY   = ("Segoe UI", 8)
F_MONO   = ("Cascadia Code", 9) if False else ("Consolas", 9)

# ── CSV helpers ───────────────────────────────────────────────────────────────
def load_csv():
    rows = []
    if os.path.exists(CSV_FILE):
        with open(CSV_FILE, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                rows.append({
                    "username":     row.get("username", "").strip(),
                    "old_password": row.get("old_password", "").strip(),
                    "new_password": row.get("new_password", "").strip(),
                })
    return rows

def save_csv(rows):
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["username", "old_password", "new_password"])
        w.writeheader()
        w.writerows(rows)

# ── Parse import text ─────────────────────────────────────────────────────────
def parse_import_text(text):
    pairs = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.split(r'\s*/\s*|\s*\|\s*|\s*:\s*|\t', line, maxsplit=1)
        if len(m) == 2 and m[0].strip() and m[1].strip():
            pairs.append((m[0].strip(), m[1].strip()))
            continue
        parts = line.split()
        if len(parts) >= 2:
            pairs.append((parts[0], parts[1]))
    return pairs


# ═══════════════════════════════════════════════════════════════════════════════
#  Custom Widgets
# ═══════════════════════════════════════════════════════════════════════════════

class HoverButton(tk.Button):
    """Button co hover effect (doi bg khi mouse enter/leave)."""
    def __init__(self, master, bg_normal, bg_hover, fg_normal="#fff", **kw):
        kw.setdefault("fg", fg_normal)
        super().__init__(master, relief="flat", bd=0, cursor="hand2",
                         bg=bg_normal, activebackground=bg_hover,
                         activeforeground=kw["fg"], **kw)
        self._bg_n = bg_normal
        self._bg_h = bg_hover
        self.bind("<Enter>",  lambda e: self.config(bg=self._bg_h))
        self.bind("<Leave>",  lambda e: self.config(bg=self._bg_n))

    def set_colors(self, bg_normal, bg_hover):
        self._bg_n = bg_normal
        self._bg_h = bg_hover
        self.config(bg=bg_normal)

class Card(tk.Frame):
    """Panel card co border nhe."""
    def __init__(self, master, **kw):
        kw.setdefault("bg", BG_CARD)
        kw.setdefault("highlightbackground", BORDER)
        kw.setdefault("highlightthickness", 1)
        kw.setdefault("bd", 0)
        super().__init__(master, **kw)

class SectionLabel(tk.Label):
    """Label section header co gach ngang ben phai."""
    def __init__(self, master, text, **kw):
        kw.setdefault("font", F_H2)
        kw.setdefault("bg", kw.pop("bg", BG_CARD))
        kw.setdefault("fg", ACCENT_LT)
        kw.setdefault("anchor", "w")
        super().__init__(master, text=text, **kw)


# ═══════════════════════════════════════════════════════════════════════════════
#  Main App
# ═══════════════════════════════════════════════════════════════════════════════

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Auto Password Manager — Ngoc Rong Online")
        self.geometry("980x720")
        self.minsize(840, 600)
        self.configure(bg=BG_DARK)
        self.resizable(True, True)

        w, h = 980, 720
        self.update_idletasks()
        x = (self.winfo_screenwidth()  - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

        self._running    = False
        self._proc       = None
        self._rows       = load_csv()
        self._status_map = {}

        self._setup_styles()
        self._build_ui()
        self._refresh_table()

    # ── ttk styles ────────────────────────────────────────────────────────────
    def _setup_styles(self):
        s = ttk.Style(self)
        s.theme_use("clam")

        # Notebook tabs
        s.configure("NB.TNotebook", background=BG_DARK, borderwidth=0, tabmargins=(0,0,0,0))
        s.configure("NB.TNotebook.Tab",
                    background=BG_CARD, foreground=TEXT2,
                    padding=(16, 8), font=F_BODY_B, borderwidth=0)
        s.map("NB.TNotebook.Tab",
              background=[("selected", ACCENT), ("!selected", BG_CARD)],
              foreground=[("selected", "#ffffff"), ("!selected", TEXT2)])

        # Treeview
        s.configure("TV.Treeview",
                    background=BG_CARD, foreground=TEXT,
                    rowheight=30, fieldbackground=BG_CARD,
                    borderwidth=0, font=F_BODY)
        s.configure("TV.Treeview.Heading",
                    background=BG_INPUT, foreground=ACCENT_LT,
                    font=F_BODY_B, borderwidth=0, relief="flat",
                    padding=(8, 6))
        s.map("TV.Treeview",
              background=[("selected", ACCENT_DK)],
              foreground=[("selected", "#ffffff")])

        # Scrollbar
        s.configure("TScrollbar",
                    background=BG_INPUT, troughcolor=BG_CARD,
                    borderwidth=0, arrowcolor=TEXT2, gripcount=0)
        s.map("TScrollbar",
              background=[("active", BG_HOVER)])

    # ── UI skeleton ───────────────────────────────────────────────────────────
    def _build_ui(self):
        # ── Top accent bar ──
        accent_bar = tk.Frame(self, bg=ACCENT, height=3)
        accent_bar.pack(fill="x", side="top")

        # ── Header ──
        hdr = tk.Frame(self, bg=BG, height=64)
        hdr.pack(fill="x", side="top")
        hdr.pack_propagate(False)

        # Logo block
        logo_box = tk.Frame(hdr, bg=ACCENT_DK, width=44, height=44)
        logo_box.place(x=16, rely=0.5, anchor="w", y=-2)
        logo_box.pack_propagate(False)
        tk.Label(logo_box, text="N", font=("Segoe UI Semibold", 18),
                 bg=ACCENT_DK, fg="#ffffff").pack(expand=True)

        tk.Label(hdr, text="Auto Password Manager",
                 font=F_H1, bg=BG, fg=TEXT).place(x=72, rely=0.35, anchor="w")
        tk.Label(hdr, text="Ngoc Rong Online — batch password changer",
                 font=F_TINY, bg=BG, fg=TEXT3).place(x=72, rely=0.72, anchor="w")

        # Status badge (ben phai header)
        self._status_badge = tk.Label(hdr, text="  READY  ",
                                      font=F_SMALL, bg=BG_CARD, fg=TEXT2,
                                      relief="flat", padx=10, pady=4)
        self._status_badge.place(relx=1.0, x=-16, rely=0.5, anchor="e")

        self._lbl_count = tk.Label(hdr, text="0 accounts",
                                    font=F_SMALL, bg=BG, fg=TEXT2)
        self._lbl_count.place(relx=1.0, x=-110, rely=0.5, anchor="e")

        # ── Body ──
        body = tk.Frame(self, bg=BG_DARK)
        body.pack(fill="both", expand=True, padx=18, pady=14)

        # Left column — dung PanedWindow de tabs co the thu nho
        left = tk.Frame(body, bg=BG_DARK, width=300)
        left.pack(side="left", fill="y", padx=(0, 14))
        left.pack_propagate(False)

        # Right column
        right = tk.Frame(body, bg=BG_DARK)
        right.pack(side="left", fill="both", expand=True)

        # Run panel luon o duoi, fixed height
        self._build_run_panel(left)
        # Tabs fill phan con lai phia tren
        self._build_tabs(left)
        self._build_table(right)
        self._build_log(right)

    # ── Tabs: single form + bulk import ───────────────────────────────────────
    def _build_tabs(self, parent):
        nb = ttk.Notebook(parent, style="NB.TNotebook")
        nb.pack(fill="both", expand=True, pady=(0, 0))

        tab1 = tk.Frame(nb, bg=BG_CARD)
        nb.add(tab1, text="  Single Add  ")
        self._build_single_form(tab1)

        tab2 = tk.Frame(nb, bg=BG_CARD)
        nb.add(tab2, text="  Bulk Import  ")
        self._build_bulk_import(tab2)

    # ── Tab 1: single form ─────────────────────────────────────────────────────
    def _build_single_form(self, parent):
        card = Card(parent, padx=16, pady=16)
        card.pack(fill="both", expand=True)

        SectionLabel(card, "Account Details").pack(anchor="w", pady=(0, 12))

        fields = [
            ("Username / Phone / Email", "entry_user"),
            ("Current Password",          "entry_old"),
            ("New Password",              "entry_new"),
        ]
        for label, attr in fields:
            tk.Label(card, text=label.upper(), font=F_TINY, bg=BG_CARD, fg=TEXT3).pack(anchor="w")
            var = tk.StringVar()
            e = tk.Entry(card, textvariable=var, font=F_BODY,
                         bg=BG_INPUT, fg=TEXT, insertbackground=TEXT,
                         relief="flat", bd=0, highlightbackground=BORDER,
                         highlightthickness=1, highlightcolor=ACCENT)
            if "password" in label.lower() or attr.endswith("_old") or attr.endswith("_new"):
                e.config(show="\u25CF")
            e.pack(fill="x", pady=(3, 10), ipady=7, padx=1)
            setattr(self, attr, var)
            setattr(self, attr + "_w", e)

        # Show password toggle
        self._show_pw = tk.BooleanVar(value=False)
        tk.Checkbutton(card, text="Show passwords", variable=self._show_pw,
                       command=self._toggle_pw,
                       font=F_SMALL, bg=BG_CARD, fg=TEXT2,
                       selectcolor=BG_INPUT, activebackground=BG_CARD,
                       activeforeground=TEXT, bd=0).pack(anchor="w", pady=(0, 12))

        # Buttons
        btn_row = tk.Frame(card, bg=BG_CARD)
        btn_row.pack(fill="x")

        self._btn_add = HoverButton(btn_row, text="  Add  ", font=F_BODY_B,
                                     bg_normal=ACCENT, bg_hover=ACCENT_DK, fg="#ffffff",
                                     command=self._add_row)
        self._btn_add.pack(side="left", fill="x", expand=True, ipady=8, padx=(0, 5))

        self._btn_update = HoverButton(btn_row, text="  Save  ", font=F_BODY_B,
                                        bg_normal=BG_INPUT, bg_hover=BG_HOVER, fg=TEXT2,
                                        command=self._update_row, state="disabled")
        self._btn_update.pack(side="left", fill="x", expand=True, ipady=8, padx=(5, 0))

        self._selected_idx = None

    # ── Tab 2: bulk import ─────────────────────────────────────────────────────
    def _build_bulk_import(self, parent):
        card = Card(parent, padx=16, pady=16)
        card.pack(fill="both", expand=True)

        SectionLabel(card, "Bulk Import").pack(anchor="w", pady=(0, 8))

        hint = ("Paste accounts below — one per line:\n"
                "  account1/oldpass1\n"
                "  account2/oldpass2\n"
                "Separators:  /  |  :  tab  space")
        tk.Label(card, text=hint, font=(F_MONO[0], 8), bg=BG_CARD, fg=TEXT3,
                 justify="left").pack(anchor="w", pady=(0, 8))

        # Text area
        tk.Label(card, text="ACCOUNTS LIST", font=F_TINY, bg=BG_CARD, fg=TEXT3).pack(anchor="w")
        txt_wrap = tk.Frame(card, bg=BORDER)
        txt_wrap.pack(fill="both", expand=True, pady=(3, 10))

        self._bulk_text = tk.Text(txt_wrap, font=F_MONO,
                                   bg=BG_INPUT, fg=TEXT, insertbackground=TEXT,
                                   relief="flat", bd=0, wrap="none",
                                   padx=8, pady=6, undo=True,
                                   selectbackground=ACCENT_DK, selectforeground="#fff")
        sb = ttk.Scrollbar(txt_wrap, orient="vertical", command=self._bulk_text.yview)
        self._bulk_text.configure(yscrollcommand=sb.set)
        self._bulk_text.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")

        # New password field
        tk.Label(card, text="NEW PASSWORD (applies to all)", font=F_TINY,
                 bg=BG_CARD, fg=TEXT3).pack(anchor="w")
        pw_row = tk.Frame(card, bg=BG_CARD)
        pw_row.pack(fill="x", pady=(3, 8))

        self._bulk_newpw = tk.StringVar()
        self._bulk_newpw_w = tk.Entry(pw_row, textvariable=self._bulk_newpw,
                                       font=F_BODY, show="\u25CF",
                                       bg=BG_INPUT, fg=TEXT, insertbackground=TEXT,
                                       relief="flat", bd=0, highlightbackground=BORDER,
                                       highlightthickness=1, highlightcolor=ACCENT)
        self._bulk_newpw_w.pack(side="left", fill="x", expand=True, ipady=7)

        self._show_bulk_pw = tk.BooleanVar(value=False)
        tk.Checkbutton(pw_row, text="Show", variable=self._show_bulk_pw,
                       command=lambda: self._bulk_newpw_w.config(
                           show="" if self._show_bulk_pw.get() else "\u25CF"),
                       font=F_SMALL, bg=BG_CARD, fg=TEXT2,
                       selectcolor=BG_INPUT, activebackground=BG_CARD, bd=0).pack(side="left", padx=(8, 0))

        # Preview
        self._bulk_preview = tk.Label(card, text="", font=F_SMALL, bg=BG_CARD, fg=TEXT3)
        self._bulk_preview.pack(anchor="w", pady=(0, 4))
        self._bulk_text.bind("<KeyRelease>", self._update_bulk_preview)

        # Import mode
        mode_row = tk.Frame(card, bg=BG_CARD)
        mode_row.pack(fill="x", pady=(0, 10))
        tk.Label(mode_row, text="Mode:", font=F_SMALL, bg=BG_CARD, fg=TEXT2).pack(side="left")
        self._import_mode = tk.StringVar(value="append")
        tk.Radiobutton(mode_row, text="Append", variable=self._import_mode,
                       value="append", font=F_SMALL, bg=BG_CARD, fg=TEXT,
                       selectcolor=BG_INPUT, activebackground=BG_CARD, bd=0).pack(side="left", padx=(10, 0))
        tk.Radiobutton(mode_row, text="Replace all", variable=self._import_mode,
                       value="replace", font=F_SMALL, bg=BG_CARD, fg=TEXT,
                       selectcolor=BG_INPUT, activebackground=BG_CARD, bd=0).pack(side="left", padx=(10, 0))

        # Import button
        HoverButton(card, text="  IMPORT ACCOUNTS  ", font=F_BODY_B,
                    bg_normal=ACCENT, bg_hover=ACCENT_DK, fg="#ffffff",
                    command=self._do_bulk_import).pack(fill="x", ipady=9)

    def _update_bulk_preview(self, event=None):
        text = self._bulk_text.get("1.0", "end")
        pairs = parse_import_text(text)
        if pairs:
            self._bulk_preview.config(
                text=f"\u2713  {len(pairs)} accounts detected — ready to import",
                fg=SUCCESS)
        else:
            self._bulk_preview.config(text="No accounts detected", fg=TEXT3)

    def _do_bulk_import(self):
        text  = self._bulk_text.get("1.0", "end")
        newpw = self._bulk_newpw.get().strip()
        pairs = parse_import_text(text)

        if not pairs:
            messagebox.showwarning("Empty", "Paste accounts into the text area first.")
            return
        if not newpw:
            messagebox.showwarning("Missing new password", "Enter a new password for all accounts.")
            return

        new_rows = [
            {"username": u, "old_password": p, "new_password": newpw}
            for u, p in pairs
        ]

        if self._import_mode.get() == "replace":
            if self._rows and not messagebox.askyesno(
                    "Confirm", f"Replace {len(self._rows)} existing accounts with {len(new_rows)} new ones?"):
                return
            self._rows = new_rows
        else:
            existing = {r["username"] for r in self._rows}
            skipped = []
            for r in new_rows:
                if r["username"] in existing:
                    skipped.append(r["username"])
                else:
                    self._rows.append(r)
                    existing.add(r["username"])
            if skipped:
                self._log(f"Skipped {len(skipped)} duplicates: {', '.join(skipped[:5])}{'...' if len(skipped)>5 else ''}", "warn")

        save_csv(self._rows)
        self._refresh_table()
        self._log(f"Imported {len(new_rows)} accounts | new password set", "ok")
        self._bulk_text.delete("1.0", "end")
        self._bulk_newpw.set("")
        self._bulk_preview.config(text="")

    # ── Run panel (bottom left) ────────────────────────────────────────────────
    def _build_run_panel(self, parent):
        card = Card(parent, padx=16, pady=14)
        card.pack(fill="x", side="bottom", pady=(10, 0))

        SectionLabel(card, "Run Settings").pack(anchor="w", pady=(0, 10))

        # ── Chrome status + Launch button ──
        chrome_row = tk.Frame(card, bg=BG_CARD)
        chrome_row.pack(fill="x", pady=(0, 8))

        self._chrome_dot = tk.Label(chrome_row, text="●", font=("Segoe UI", 12),
                                     bg=BG_CARD, fg=DANGER)
        self._chrome_dot.pack(side="left")

        self._chrome_lbl = tk.Label(chrome_row, text=" Chrome: not running",
                                     font=F_SMALL, bg=BG_CARD, fg=TEXT2, anchor="w")
        self._chrome_lbl.pack(side="left", fill="x", expand=True)

        self._btn_chrome = HoverButton(chrome_row, text=" Launch ",
                                        font=F_SMALL,
                                        bg_normal=INFO, bg_hover="#3a8ee8", fg="#fff",
                                        command=self._launch_chrome)
        self._btn_chrome.pack(side="right")

        tk.Frame(card, bg=BORDER, height=1).pack(fill="x", pady=(0, 8))

        # Headless toggle
        r1 = tk.Frame(card, bg=BG_CARD)
        r1.pack(fill="x", pady=2)
        tk.Label(r1, text="Headless mode", font=F_SMALL, bg=BG_CARD, fg=TEXT2,
                 width=14, anchor="w").pack(side="left")
        self._headless = tk.BooleanVar(value=False)
        tk.Checkbutton(r1, variable=self._headless,
                       bg=BG_CARD, fg=TEXT, selectcolor=BG_INPUT,
                       activebackground=BG_CARD, bd=0).pack(side="left")

        # Concurrency
        r2 = tk.Frame(card, bg=BG_CARD)
        r2.pack(fill="x", pady=2)
        tk.Label(r2, text="Concurrency", font=F_SMALL, bg=BG_CARD, fg=TEXT2,
                 width=14, anchor="w").pack(side="left")
        self._concurrency = tk.IntVar(value=1)
        tk.Spinbox(r2, from_=1, to=5, textvariable=self._concurrency,
                   width=4, font=F_BODY, bg=BG_INPUT, fg=TEXT,
                   insertbackground=TEXT, buttonbackground=BG_INPUT,
                   relief="flat", bd=0, highlightbackground=BORDER,
                   highlightthickness=1).pack(side="left", padx=(0, 4))
        tk.Label(r2, text="parallel", font=F_SMALL, bg=BG_CARD, fg=TEXT3).pack(side="left")

        # Separator
        tk.Frame(card, bg=BORDER, height=1).pack(fill="x", pady=10)

        # Progress bar
        self._progress = ttk.Progressbar(card, mode="determinate",
                                           style="Horizontal.TProgressbar")
        self._setup_progress_style()
        self._progress.pack(fill="x", pady=(0, 8))

        # Run / Stop buttons
        self._btn_run = HoverButton(card, text="\u25B6  CHANGE ALL PASSWORDS",
                                     font=("Segoe UI Semibold", 11),
                                     bg_normal=SUCCESS, bg_hover=SUCCESS_DK, fg="#0f0f1a",
                                     command=self._run)
        self._btn_run.pack(fill="x", ipady=10, pady=(0, 6))

        self._btn_stop = HoverButton(card, text="\u25A0  STOP",
                                      font=F_BODY_B,
                                      bg_normal=DANGER, bg_hover=DANGER_DK, fg="#ffffff",
                                      command=self._stop, state="disabled")
        self._btn_stop.pack(fill="x", ipady=7)

        # Poll Chrome status moi 3s
        self._poll_chrome_status()

    def _setup_progress_style(self):
        s = ttk.Style(self)
        s.configure("Horizontal.TProgressbar",
                    background=ACCENT, troughcolor=BG_INPUT,
                    borderwidth=0, thickness=6)

    # ── Table ──────────────────────────────────────────────────────────────────
    def _build_table(self, parent):
        # Header row
        hdr = tk.Frame(parent, bg=BG_DARK)
        hdr.pack(fill="x", pady=(0, 6))

        SectionLabel(hdr, "Accounts", bg=BG_DARK).pack(side="left")

        HoverButton(hdr, text="  Xoa chon  ", font=F_SMALL,
                    bg_normal=DANGER, bg_hover=DANGER_DK, fg="#ffffff",
                    command=self._delete_selected).pack(side="right")
        HoverButton(hdr, text="  Xoa tat ca  ", font=F_SMALL,
                    bg_normal=BG_INPUT, bg_hover=DANGER_DK, fg=TEXT,
                    command=self._clear_all).pack(side="right", padx=(0, 6))

        # Treeview
        cols   = ("idx", "username", "old_pw", "new_pw", "status")
        widths = {"idx": 40, "username": 200, "old_pw": 140, "new_pw": 140, "status": 130}
        labels = {"idx": "#", "username": "Username", "old_pw": "Old Password",
                  "new_pw": "New Password", "status": "Status"}

        tv_wrap = tk.Frame(parent, bg=BORDER)
        tv_wrap.pack(fill="both", expand=True)

        self._tree = ttk.Treeview(tv_wrap, columns=cols, show="headings",
                                   style="TV.Treeview", selectmode="extended")
        for col in cols:
            self._tree.heading(col, text=labels[col], anchor="w")
            self._tree.column(col, width=widths[col], minwidth=widths[col], anchor="w")

        self._tree.tag_configure("success", foreground=SUCCESS)
        self._tree.tag_configure("fail",    foreground=DANGER)
        self._tree.tag_configure("pending", foreground=WARNING)
        self._tree.tag_configure("odd",     background=BG_CARD)
        self._tree.tag_configure("even",    background="#1a1a2c")

        sb = ttk.Scrollbar(tv_wrap, orient="vertical", command=self._tree.yview)
        self._tree.configure(yscrollcommand=sb.set)
        self._tree.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")

        self._tree.bind("<<TreeviewSelect>>", self._on_select)

    # ── Log panel ──────────────────────────────────────────────────────────────
    def _build_log(self, parent):
        lf = tk.Frame(parent, bg=BG_DARK)
        lf.pack(fill="x", pady=(10, 0))

        hdr = tk.Frame(lf, bg=BG_DARK)
        hdr.pack(fill="x", pady=(0, 4))
        SectionLabel(hdr, "Activity Log", bg=BG_DARK).pack(side="left")
        HoverButton(hdr, text=" Clear ", font=F_SMALL,
                    bg_normal=BG_INPUT, bg_hover=BG_HOVER, fg=TEXT2,
                    command=self._clear_log).pack(side="right")

        log_wrap = tk.Frame(lf, bg=BORDER)
        log_wrap.pack(fill="x")

        self._log_text = tk.Text(log_wrap, height=6, font=F_MONO,
                                  bg=BG, fg=TEXT2,
                                  relief="flat", bd=0,
                                  state="disabled", wrap="word",
                                  padx=10, pady=8,
                                  insertbackground=TEXT,
                                  selectbackground=ACCENT_DK, selectforeground="#fff")
        self._log_text.pack(fill="x")
        for tag, color in [("ok", SUCCESS), ("fail", DANGER),
                           ("warn", WARNING), ("info", TEXT2)]:
            self._log_text.tag_configure(tag, foreground=color)

    def _clear_log(self):
        self._log_text.config(state="normal")
        self._log_text.delete("1.0", "end")
        self._log_text.config(state="disabled")

    # ── Refresh table ─────────────────────────────────────────────────────────
    def _refresh_table(self, status_map=None):
        self._tree.delete(*self._tree.get_children())
        sm = status_map or self._status_map
        for i, row in enumerate(self._rows):
            st  = sm.get(i, "")
            if st == "OK":
                tag = "success"
            elif st and st != "\u2014":
                tag = "fail"
            else:
                tag = "odd" if i % 2 == 0 else "even"
            old_m = "\u25CF" * min(len(row["old_password"]), 12)
            new_m = "\u25CF" * min(len(row["new_password"]), 12)
            self._tree.insert("", "end", iid=str(i),
                               values=(i + 1, row["username"], old_m, new_m, st or "\u2014"),
                               tags=(tag,))
        self._lbl_count.config(text=f"{len(self._rows)} accounts")

    # ── Table events ───────────────────────────────────────────────────────────
    def _on_select(self, event):
        sel = self._tree.selection()
        if len(sel) == 1:
            idx = int(sel[0])
            row = self._rows[idx]
            self.entry_user.set(row["username"])
            self.entry_old.set(row["old_password"])
            self.entry_new.set(row["new_password"])
            self._selected_idx = idx
            self._btn_update.config(state="normal")
            self._btn_update.set_colors(WARNING, "#e6b84d")
            self._btn_add.config(text="  Add New  ")
        else:
            self._selected_idx = None
            self._btn_update.config(state="disabled")
            self._btn_update.set_colors(BG_INPUT, BG_HOVER)
            self._btn_add.config(text="  Add  ")

    # ── CRUD ───────────────────────────────────────────────────────────────────
    def _add_row(self):
        u, o, n = (self.entry_user.get().strip(),
                   self.entry_old.get().strip(),
                   self.entry_new.get().strip())
        if not u or not o or not n:
            messagebox.showwarning("Missing info",
                "Fill in Username, Current Password, and New Password.")
            return
        self._rows.append({"username": u, "old_password": o, "new_password": n})
        save_csv(self._rows)
        self._refresh_table()
        self._clear_form()
        self._log(f"Added: {u}", "info")

    def _update_row(self):
        if self._selected_idx is None:
            return
        u, o, n = (self.entry_user.get().strip(),
                   self.entry_old.get().strip(),
                   self.entry_new.get().strip())
        if not u or not o or not n:
            messagebox.showwarning("Missing info", "Fill in all fields.")
            return
        self._rows[self._selected_idx] = {"username": u, "old_password": o, "new_password": n}
        save_csv(self._rows)
        self._refresh_table()
        self._clear_form()
        self._log(f"Updated: {u}", "info")

    def _delete_selected(self):
        sel = self._tree.selection()
        if not sel:
            return
        if not messagebox.askyesno("Confirm", f"Delete {len(sel)} selected accounts?"):
            return
        for idx in sorted([int(s) for s in sel], reverse=True):
            self._log(f"Deleted: {self._rows[idx]['username']}", "warn")
            del self._rows[idx]
        save_csv(self._rows)
        self._status_map = {}
        self._refresh_table()
        self._clear_form()

    def _clear_all(self):
        if not self._rows:
            return
        if not messagebox.askyesno("Clear all", "Remove all accounts from the list?"):
            return
        self._rows.clear()
        self._status_map = {}
        save_csv(self._rows)
        self._refresh_table()
        self._log("Cleared all accounts.", "warn")

    def _clear_form(self):
        self.entry_user.set("")
        self.entry_old.set("")
        self.entry_new.set("")
        self._selected_idx = None
        self._btn_update.config(state="disabled")
        self._btn_update.set_colors(BG_INPUT, BG_HOVER)
        self._btn_add.config(text="  Add  ")
        self._tree.selection_remove(self._tree.selection())

    def _toggle_pw(self):
        show = "" if self._show_pw.get() else "\u25CF"
        self.entry_old_w.config(show=show)
        self.entry_new_w.config(show=show)

    # ── Chrome control ────────────────────────────────────────────────────────
    def _is_chrome_running(self):
        try:
            import urllib.request
            urllib.request.urlopen("http://localhost:9222/json/version", timeout=1)
            return True
        except:
            return False

    def _launch_chrome(self):
        if self._is_chrome_running():
            self._log("Chrome debug da chay roi!", "ok")
            return
        chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        user_data = os.path.join(os.environ.get("TEMP", r"C:\Temp"), "chrome-auto")
        try:
            subprocess.Popen([
                chrome,
                "--remote-debugging-port=9222",
                f"--user-data-dir={user_data}",
                "--no-first-run",
                "--no-default-browser-check",
            ])
            self._log("Dang mo Chrome... cho 3s", "info")
            self.after(3000, self._poll_chrome_status)
        except FileNotFoundError:
            self._log("Khong tim thay Chrome!", "fail")
            messagebox.showerror("Error", f"Khong tim thay:\n{chrome}")

    def _poll_chrome_status(self):
        """Cap nhat dot mau + label Chrome status moi 3 giay."""
        ok = self._is_chrome_running()
        if ok:
            self._chrome_dot.config(fg=SUCCESS)
            self._chrome_lbl.config(text=" Chrome: ready (port 9222)", fg=SUCCESS)
            self._btn_chrome.config(text=" OK ", state="disabled")
            self._btn_chrome.set_colors(SUCCESS_DK, SUCCESS_DK)
        else:
            self._chrome_dot.config(fg=DANGER)
            self._chrome_lbl.config(text=" Chrome: not running", fg=TEXT2)
            self._btn_chrome.config(text=" Launch ", state="normal")
            self._btn_chrome.set_colors(INFO, "#3a8ee8")
        self.after(3000, self._poll_chrome_status)

    # ── Run / Stop ────────────────────────────────────────────────────────────
    def _run(self):
        if not self._rows:
            messagebox.showwarning("Empty list", "No accounts in the list.")
            return
        if self._running:
            return
        if not self._is_chrome_running():
            if not messagebox.askyesno(
                "Chrome chua chay",
                "Chrome debug (port 9222) chua duoc bat.\n\n"
                "Bam 'Yes' de tu dong bat Chrome roi chay.\n"
                "Bam 'No' de huy."
            ):
                return
            self._launch_chrome()
            # Cho Chrome bat xong roi moi chay
            self.after(4000, self._run)
            return
        self._running = True
        self._status_map = {}
        self._progress["value"] = 0
        self._progress["maximum"] = len(self._rows)
        self._btn_run.config(state="disabled")
        self._btn_run.set_colors("#3a3a4a", "#3a3a4a")
        self._btn_stop.config(state="normal")
        self._status_badge.config(text="  RUNNING  ", bg=WARNING, fg="#1a1a2c")

        concurrency = str(self._concurrency.get())
        self._log("=" * 50, "info")
        self._log(
            f"Started: {len(self._rows)} accounts | "
            f"concurrency={concurrency} | "
            f"headless={self._headless.get()}",
            "info")

        def worker():
            script = os.path.join(os.path.dirname(__file__), "run.js")
            cmd = ["node", script, "--concurrency", concurrency]
            if self._headless.get():
                cmd.append("--headless")
            try:
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, encoding="utf-8", errors="replace",
                    cwd=os.path.dirname(__file__))
                self._proc = proc
                for line in proc.stdout:
                    line = line.rstrip()
                    if not line:
                        continue
                    lo = line.lower()
                    if any(k in lo for k in ("thanh cong", "success")):
                        tag = "ok"
                    elif any(k in lo for k in ("that bai", "fail", "loi", "error")):
                        tag = "fail"
                    elif any(k in lo for k in ("warning", "warn", "skip")):
                        tag = "warn"
                    else:
                        tag = "info"
                    self.after(0, lambda l=line, t=tag: self._log(l, t))
                proc.wait()
                self.after(0, self._on_done)
            except Exception as e:
                self.after(0, lambda: self._log(f"Error: {e}", "fail"))
                self.after(0, self._on_done)

        threading.Thread(target=worker, daemon=True).start()
        self.after(2000, self._poll_results)

    def _poll_results(self):
        if not self._running:
            return
        self._load_results()
        self.after(3000, self._poll_results)

    def _load_results(self):
        if not os.path.exists(RESULTS_FILE):
            return
        try:
            with open(RESULTS_FILE, encoding="utf-8") as f:
                results = json.load(f)
            sm = {}
            for res in results:
                uname = res.get("username", "")
                for i, row in enumerate(self._rows):
                    if row["username"] == uname:
                        if res.get("success") is True:
                            sm[i] = "\u2713 Done"
                        elif res.get("success") is False:
                            sm[i] = "\u2717 " + res.get("message", "Error")[:16]
                        else:
                            sm[i] = "?"
                        break
            self._status_map = sm
            self._refresh_table()
            done = len(sm)
            self._progress["value"] = done
        except Exception:
            pass

    def _on_done(self):
        self._running = False
        self._btn_run.config(state="normal")
        self._btn_run.set_colors(SUCCESS, SUCCESS_DK)
        self._btn_stop.config(state="disabled")
        self._progress["value"] = self._progress["maximum"]
        self._status_badge.config(text="  READY  ", bg=BG_CARD, fg=TEXT2)
        self._log("Completed!", "ok")
        self._load_results()

    def _stop(self):
        if self._proc and self._proc.poll() is None:
            self._proc.terminate()
            self._log("Process stopped.", "warn")
        self._on_done()

    # ── Log helper ─────────────────────────────────────────────────────────────
    def _log(self, msg, tag="info"):
        ts = datetime.now().strftime("%H:%M:%S")
        self._log_text.config(state="normal")
        self._log_text.insert("end", f"[{ts}] {msg}\n", tag)
        self._log_text.see("end")
        self._log_text.config(state="disabled")


if __name__ == "__main__":
    App().mainloop()
