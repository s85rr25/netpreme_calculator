# Netpreme X-Mem design-in calculator

Compare the cost of serving the same workload with a baseline system and a system with X-Mem. The prototype uses illustrative inputs and calculates entirely in the browser.

## Open the dashboard

Open `index.html` in a browser. No installation, build, or server is required. To preview it on a local server instead, run `python3 -m http.server 8000` from the repository directory and open `http://localhost:8000/`.

## Try the demo

1. The dashboard starts at **$0.278** per million tokens for the baseline and **$0.255** for X-Mem. That's **8.3%** savings, below the **10.0%** target. The **$108,000** upfront X-Mem ceiling is **$36,000** below the demo installed price.
2. Select **Edit assumptions** and change the installed X-Mem cost in **System with X-Mem** to `108000`. Select **View updated results** to confirm the decision changes to **Meets target**.
3. Clear either throughput input to verify that the calculator flags it and hides the results. Select **Reset demo values** to restore the original scenario.

Use throughput measured at the same model, latency, and quality targets for both systems. Check fleet total cost of ownership separately from the price ceiling: the fleet calculation rounds up to whole systems.