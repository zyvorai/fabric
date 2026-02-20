from setuptools import setup, find_packages

setup(
    name="vmspawnctl",
    version="0.1.0",
    packages=find_packages(),
    install_requires=["requests>=2.28"],
    python_requires=">=3.8",
    description="Python SDK for vmspawnd",
    author="vmspawnd contributors",
    license="MIT",
    entry_points={
        "console_scripts": [
            "vmspawnctl=vmspawnctl.cli:main",
        ],
    },
)
