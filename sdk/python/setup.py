from setuptools import setup

setup(
    name="opp-client",
    version="1.0.0",
    py_modules=["opp_client"],
    install_requires=["requests", "cryptography"],
    description="Python client for the Open Primitive Protocol",
    author="David Hamilton",
    url="https://openprimitive.com/protocol.html",
)
