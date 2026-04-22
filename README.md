# 🚗 Tesla Smart Route Planner (Hong Kong)

A specialized travel budgeting and navigation tool designed for Tesla owners in Hong Kong. This application calculates the total cost of a trip by combining real-time electricity consumption estimates with the 2026 Hong Kong "HKeToll" tunnel fee structures.



## ✨ Key Features

- **Smart Tunnel Sensing**: The interface dynamically filters and displays only relevant tunnels based on your origin and destination (e.g., it won't show Cross-Harbour tunnels if you are traveling within the New Territories).
- **Dual-Route Visualization**: Support for "Return Trip" mode with distinct color coding:
    - 🔴 **Red Line**: Outbound journey.
    - 🔵 **Blue Line**: Return journey.
- **2026 Time-Based Tolls**: Automatically calculates tolls for the three harbour crossings based on the time of day (Peak, Normal, and Off-peak rates).
- **Energy Estimation**: Calculated based on the average efficiency of a Tesla Model 3/Y (approx. 0.157 kWh/km) and current Supercharging rates.
- **Tai Po Road Option**: Includes "Tai Po Road" as a $0 toll alternative for commutes between NT and Kowloon.
- **Tesla-Inspired UI**: A sleek, dark-mode interface optimized for mobile and desktop use.

## 🛠️ Technical Stack

- **Frontend**: HTML5, CSS3 (Custom Tesla Dark Mode theme).
- **Logic**: Vanilla JavaScript (ES6+).
- **APIs**: 
    - [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/overview) - Map rendering and polyline display.
    - [Google Places API (Autocomplete)](https://developers.google.com/maps/documentation/javascript/places-autocomplete) - Smart location searching.
    - [Google Directions API](https://developers.google.com/maps/documentation/directions/overview) - Distance calculation and waypoint routing.

## 🚀 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone [https://github.com/lincolntam/mycar.git](https://github.com/lincolntam/mycar.git)
