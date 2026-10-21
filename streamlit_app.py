"""Serves the Leve web app (built into leve_build/) on Streamlit Community Cloud.

Leve is a React app, so Streamlit only hosts it: the build is served as a
static component and stretched to fill the page. Rebuild after changing the
code with `npm run build:streamlit` and commit leve_build/.
"""
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(page_title="Leve", page_icon="🟢", layout="wide", initial_sidebar_state="collapsed")

# Hide Streamlit's chrome and let the app's iframe take the whole viewport.
st.markdown(
    """
    <style>
      header, footer, [data-testid="stToolbar"], [data-testid="stDecoration"], [data-testid="stStatusWidget"] { display: none !important; }
      .stApp, .main, [data-testid="stAppViewContainer"], [data-testid="stMain"] { padding: 0 !important; overflow: hidden !important; }
      .block-container, [data-testid="stMainBlockContainer"] { padding: 0 !important; max-width: 100% !important; }
      [data-testid="stVerticalBlock"] { gap: 0 !important; }
      iframe { display: block; width: 100% !important; height: 100vh !important; height: 100dvh !important; border: 0; }
    </style>
    """,
    unsafe_allow_html=True,
)

leve = components.declare_component("leve", path=str(Path(__file__).parent / "leve_build"))
leve(key="leve")
