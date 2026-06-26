# Remote Monitoring Dashboard

### Sample UPS & Battery Monitoring Dashboard for Industrial Power Infrastructure

## Overview

This Dashboard is a **sample industrial monitoring dashboard** developed as part of my **Summer Internship at Reliance Industries Limited (RIL), Nagothane Manufacturing Division (NMD)**.

The project demonstrates how a modern SCADA-inspired web dashboard can be used to visualize the health and operational status of **UPS systems and Battery Chargers** in a petrochemical plant using an **SNMP-based monitoring architecture**.

> **Disclaimer**
>
> This project is a **personal demonstration prototype** created for learning and portfolio purposes during my internship. It is **not an official Reliance Industries Limited product**, and the data, architecture, alarms, IP addresses, and telemetry shown are simulated.

---

## Project Objective

The objective of this prototype is to demonstrate:

* Real-time monitoring of industrial UPS systems
* Battery health visualization
* SCADA-inspired dashboard design
* SNMP monitoring workflow
* Industrial alarm management
* Historical trend visualization
* Purdue Model architecture visualization
* IEC 62443-inspired industrial cybersecurity concepts

---

## Features

### Dashboard

* Industrial SCADA-style user interface
* Live equipment status cards
* Plant-wide KPI summary
* System health indicators
* Network status overview
* Security compliance panel
* Integration status display

### SNMP Monitoring Workflow

Interactive visualization of the complete monitoring cycle:

1. SNMP Manager
2. Firewall / DMZ
3. Network Management Card (NMC)
4. SNMP Response
5. Data Processing
6. Database Storage
7. Alarm Generation

---

### Reference Architecture

Interactive Purdue Model architecture illustrating:

* Enterprise Zone
* DMZ
* Operations Network
* Control Network
* Device Layer
* Industrial communication flow

---

### Historical Trends

Charts for monitoring:

* Battery Capacity
* Input Voltage
* Output Load
* Battery Temperature

Powered using **Chart.js**.

---

### Alarm Management

Simulation of industrial alarm handling including:

* Utility Failure
* UPS on Battery
* Battery Low
* Overload
* Alarm Acknowledgement
* Alarm History

---

## Technology Stack

### Frontend

* HTML5
* CSS3
* JavaScript (ES6)
* Chart.js
* Google Fonts

---

## Dashboard Modules

* SCADA Dashboard
* UPS Monitoring
* Battery Monitoring
* SNMP Polling Visualization
* Purdue Architecture Viewer
* Historical Trend Analysis
* Alarm Management
* Event Log
* System Status Monitoring

---

## Industrial Concepts Demonstrated

* SNMPv3 Monitoring
* UPS Network Management Cards (NMC)
* Battery Charger Monitoring
* Industrial Ethernet
* VLAN Segmentation
* OT Network Design
* IEC 62443 Security Concepts
* Purdue Enterprise Reference Architecture
* Time-Series Data Visualization
* Alarm Management Workflow

---

## Sample Dashboard Preview

The dashboard includes:

* Real-time industrial monitoring interface
* Interactive navigation
* Animated data flow
* Live KPI cards
* Alarm simulation
* Historical trend charts
* Architecture visualization

---

## Project Structure

```
Root Folder/
│
├── index.html
├── style.css
├── app.js
│
└── README.md
```

---

## Future Enhancements

Potential future improvements include:

* Backend API integration
* Live SNMP polling
* MQTT support
* Modbus TCP integration
* OPC UA connectivity
* Authentication and role-based access control
* Historical database integration
* PDF report generation
* Mobile responsive layout
* Dark/Light theme support

---

## Learning Outcomes

This project helped strengthen my understanding of:

* Industrial Automation
* SCADA System Design
* UPS Monitoring Systems
* Network Management Protocols
* Industrial Cybersecurity
* Dashboard Development
* Human-Machine Interface (HMI) Design
* Industrial Data Visualization

---

## Internship Context

This dashboard was created during my **Summer Internship at Reliance Industries Limited (RIL), Nagothane Manufacturing Division (NMD)** as a **sample visualization prototype** to explore modern approaches for industrial UPS and Battery Charger monitoring.

The implementation is intended solely for educational, demonstration, and portfolio purposes and does not represent any production system used by Reliance Industries Limited.

---

## Author

**Ustela Sukesh Reddy**

B.Tech, Electrical Engineering

National Institute of Technology Durgapur

Interested in:

* Industrial IoT (IIoT)
* SCADA Systems
* Power Systems
* Industrial Automation
* Backend Systems
* Distributed Systems
