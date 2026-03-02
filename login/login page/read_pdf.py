import sys

try:
    import PyPDF2
    
    with open('developer-internship.pdf', 'rb') as file:
        reader = PyPDF2.PdfReader(file)
        text = ''
        for page in reader.pages:
            text += page.extract_text() + '\n'
        print(text)
except ImportError:
    print("ERROR: PyPDF2 not installed. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'PyPDF2'])
    print("Please run the script again.")
except Exception as e:
    print(f"ERROR: {e}")
