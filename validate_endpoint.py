#!/usr/bin/env python
"""Validate audio endpoint schema"""

import sys
sys.path.insert(0, '/app')

from app.routes.chat import router
import inspect

# Find and inspect the send_audio endpoint
for route in router.routes:
    if hasattr(route, 'path') and '/audio' in route.path:
        if hasattr(route, 'endpoint'):
            sig = inspect.signature(route.endpoint)
            print(f"📞 Endpoint: {route.path}")
            print(f"📞 Methods: {route.methods}")
            print(f"📞 Parameters:")
            for param_name, param in sig.parameters.items():
                print(f"  - {param_name}: {param.annotation}")
            print()
