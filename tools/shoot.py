#!/usr/bin/env python3
"""Headless screenshots of the Scene (PySide6 + QT_QPA_PLATFORM=offscreen).
Usage: python tools/shoot.py [outdir]   (default ./screens)"""
import os, sys
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
from pathlib import Path
from PySide6.QtCore import QTimer, QUrl
from PySide6.QtGui import QGuiApplication
from PySide6.QtQml import QQmlApplicationEngine
from PySide6.QtQuick import QQuickWindow

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1] if len(sys.argv) > 1 else root / "screens").resolve()
out.mkdir(parents=True, exist_ok=True)
SCENES = ["idle", "riding", "wheelie", "lane", "crash", "crashed", "turbo", "overheat",
          "ramp-up", "airborne", "cool-arrow", "boost", "land-crash",
          "big-ramp", "airborne-big", "side-crash", "pieces-overview", "mud", "giant",
          "wide-partial", "hazards", "rumble", "nose", "downhill", "ramp-climb"]

app = QGuiApplication(sys.argv)
eng = QQmlApplicationEngine()
eng.load(QUrl.fromLocalFile(str(root / "tools" / "preview.qml")))
if not eng.rootObjects():
    sys.exit("failed to load preview.qml")
win = eng.rootObjects()[0]
todo = list(SCENES)

def nxt():
    if not todo:
        app.quit(); return
    name = todo[0]
    from PySide6.QtCore import QMetaObject, Q_ARG
    QMetaObject.invokeMethod(win, "scenario", Q_ARG("QVariant", name))
    QTimer.singleShot(150, grab)

def grab():
    name = todo.pop(0)
    img = QQuickWindow.grabWindow(win)
    p = out / f"{name}.png"
    img.save(str(p)); print(p)
    QTimer.singleShot(0, nxt)

QTimer.singleShot(300, nxt)
app.exec()
