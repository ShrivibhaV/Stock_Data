import sys
import os

# Try multiple PDF libraries
def extract_with_pypdf2():
    try:
        import PyPDF2
        with open('developer-internship.pdf', 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            text = ''
            for i, page in enumerate(reader.pages):
                text += f"\n--- Page {i+1} ---\n"
                text += page.extract_text()
            return text
    except Exception as e:
        return f"PyPDF2 failed: {e}"

def extract_with_pdfplumber():
    try:
        import pdfplumber
        text = ''
        with pdfplumber.open('developer-internship.pdf') as pdf:
            for i, page in enumerate(pdf.pages):
                text += f"\n--- Page {i+1} ---\n"
                text += page.extract_text()
        return text
    except Exception as e:
        return f"pdfplumber failed: {e}"

def extract_with_pymupdf():
    try:
        import fitz  # PyMuPDF
        doc = fitz.open('developer-internship.pdf')
        text = ''
        for i, page in enumerate(doc):
            text += f"\n--- Page {i+1} ---\n"
            text += page.get_text()
        return text
    except Exception as e:
        return f"PyMuPDF failed: {e}"

# Try each method
print("Attempting to extract PDF content...\n")
result = extract_with_pypdf2()
if "failed" not in result.lower():
    print(result)
else:
    print(result)
    result = extract_with_pdfplumber()
    if "failed" not in result.lower():
        print(result)
    else:
        print(result)
        result = extract_with_pymupdf()
        print(result)
