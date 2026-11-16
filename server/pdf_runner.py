# Isolated Python invocation: only this project and its vendored dependencies are added.
import sys, pathlib, runpy
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
root=pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'.python-packages'))
runpy.run_path(str(root/'server'/'pdf_template.py'),run_name='__main__')
