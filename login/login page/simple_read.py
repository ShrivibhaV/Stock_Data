try:
    from PyPDF2 import PdfReader
    reader = PdfReader('developer-internship.pdf')
    for i, page in enumerate(reader.pages):
        print(f'=== PAGE {i+1} ===')
        print(page.extract_text())
except ImportError:
    print('PyPDF2 not installed. Installing now...')
    import subprocess, sys
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'PyPDF2', '-q'])
    print('Installed. Please run again.')
except Exception as e:
    print(f'Error: {e}')
