"""移行のスクリプトはパッケージの外にあるので、
テストから import できるようこのディレクトリを sys.path に足す。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
