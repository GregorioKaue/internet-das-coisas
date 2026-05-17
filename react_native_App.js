// ============================================================
//  ESP32 Controller — Controle via MQTT
//  Expo React Native (Android)
//
//  Dependências a instalar:
//    npx expo install react-native-mqtt
//    ou: npm install paho-mqtt
//
//  Estrutura de tópicos MQTT:
//    Publicação  → "esp32/controle"   (payload: "LIGAR" / "DESLIGAR")
//    Subscrição  → "esp32/status"     (ESP32 responde neste tópico)
// ============================================================

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Animated,
  Easing,
  Platform,
} from "react-native";
import Paho from "paho-mqtt";

// ── Configurações do Broker MQTT ──────────────────────────────
// Troque pelos dados do seu broker (ex: broker.hivemq.com, Mosquitto local, etc.)
const MQTT_CONFIG = {
  host:     "broker.hivemq.com",  // Endereço do broker
  port:     8000,                  // Porta WebSocket (WS) — use 8884 para WSS
  clientId: "esp32_app_" + Math.random().toString(16).substr(2, 8),
  topicCmd:    "esp32/controle",   // Tópico para enviar comandos
  topicStatus: "esp32/status",     // Tópico para receber respostas
};

// ── Paleta de cores ───────────────────────────────────────────
const COLORS = {
  bg:         "#0A0E1A",
  card:       "#111827",
  border:     "#1E2D40",
  accent:     "#00D4FF",
  green:      "#00FF9C",
  red:        "#FF4455",
  yellow:     "#FFD600",
  textPrimary:"#E8F4FD",
  textMuted:  "#4A6580",
  textDim:    "#2A3D55",
};

// ── Formata timestamp ─────────────────────────────────────────
function timestamp() {
  const d = new Date();
  return d.toLocaleTimeString("pt-BR", { hour12: false });
}

export default function App() {
  const [connected,   setConnected]   = useState(false);
  const [deviceOn,    setDeviceOn]    = useState(false);
  const [messages,    setMessages]    = useState([]);
  const [connecting,  setConnecting]  = useState(false);
  const [lastStatus,  setLastStatus]  = useState("Aguardando resposta...");

  const clientRef    = useRef(null);
  const scrollRef    = useRef(null);

  // Animações
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const glowAnim     = useRef(new Animated.Value(0)).current;
  const statusAnim   = useRef(new Animated.Value(0)).current;

  // ── Pulse do indicador de conexão ────────────────────────────
  useEffect(() => {
    if (connected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [connected]);

  // ── Glow do botão ativo ───────────────────────────────────────
  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue:  deviceOn ? 1 : 0,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [deviceOn]);

  // ── Flash ao receber mensagem ─────────────────────────────────
  function flashStatus() {
    statusAnim.setValue(1);
    Animated.timing(statusAnim, {
      toValue:  0,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }

  // ── Adiciona mensagem ao log ──────────────────────────────────
  function addMessage(text, type = "info") {
    setMessages(prev => [
      ...prev,
      { id: Date.now(), text, type, time: timestamp() },
    ]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  // ── Conecta ao broker MQTT ────────────────────────────────────
  function conectar() {
    if (connected) {
      desconectar();
      return;
    }

    setConnecting(true);
    addMessage(`Conectando a ${MQTT_CONFIG.host}:${MQTT_CONFIG.port}...`, "system");

    const client = new Paho.Client(
      MQTT_CONFIG.host,
      MQTT_CONFIG.port,
      MQTT_CONFIG.clientId
    );

    client.onConnectionLost = (resp) => {
      setConnected(false);
      setConnecting(false);
      addMessage(`Conexão perdida: ${resp.errorMessage}`, "error");
    };

    client.onMessageArrived = (msg) => {
      const payload = msg.payloadString;
      setLastStatus(payload);
      flashStatus();
      addMessage(`ESP32 → ${payload}`, "received");
    };

    client.connect({
      onSuccess: () => {
        setConnected(true);
        setConnecting(false);
        clientRef.current = client;
        addMessage("Conectado ao broker MQTT!", "success");
        // Subscreve no tópico de status da ESP32
        client.subscribe(MQTT_CONFIG.topicStatus);
        addMessage(`Inscrito em: ${MQTT_CONFIG.topicStatus}`, "system");
      },
      onFailure: (err) => {
        setConnecting(false);
        addMessage(`Falha na conexão: ${err.errorMessage}`, "error");
      },
      useSSL:   MQTT_CONFIG.port === 8884,
      timeout:  10,
      keepAliveInterval: 30,
    });
  }

  // ── Desconecta do broker ──────────────────────────────────────
  function desconectar() {
    if (clientRef.current && connected) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setConnected(false);
    setDeviceOn(false);
    addMessage("Desconectado do broker.", "system");
  }

  // ── Publica comando no tópico da ESP32 ───────────────────────
  function publicar(comando) {
    if (!connected || !clientRef.current) {
      addMessage("Sem conexão com o broker!", "error");
      return;
    }
    const msg = new Paho.Message(comando);
    msg.destinationName = MQTT_CONFIG.topicCmd;
    msg.qos = 1;
    msg.retained = false;
    clientRef.current.send(msg);
    addMessage(`Enviado → ${comando}`, "sent");
    setDeviceOn(comando === "LIGAR");
  }

  // ── Cor do log por tipo ───────────────────────────────────────
  function logColor(type) {
    switch (type) {
      case "success":  return COLORS.green;
      case "error":    return COLORS.red;
      case "sent":     return COLORS.accent;
      case "received": return COLORS.yellow;
      case "system":   return COLORS.textMuted;
      default:         return COLORS.textPrimary;
    }
  }

  // ── Interpolações de animação ─────────────────────────────────
  const statusBg = statusAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ["rgba(0,212,255,0)", "rgba(0,212,255,0.15)"],
  });
  const glowBorder = glowAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [COLORS.border, COLORS.green],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* ── HEADER ─────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>ESP32 Controller</Text>
          <Text style={styles.headerSub}>Controle via MQTT</Text>
        </View>
        {/* Indicador de conexão */}
        <TouchableOpacity onPress={conectar} style={styles.connBadge} disabled={connecting}>
          <Animated.View style={[styles.connDot, {
            backgroundColor: connected ? COLORS.green : connecting ? COLORS.yellow : COLORS.red,
            transform: [{ scale: connected ? pulseAnim : 1 }],
          }]} />
          <Text style={[styles.connText, {
            color: connected ? COLORS.green : connecting ? COLORS.yellow : COLORS.red,
          }]}>
            {connecting ? "Conectando..." : connected ? "Online" : "Offline"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── CARD: Configuração MQTT ─────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>BROKER</Text>
        <Text style={styles.cardValue}>{MQTT_CONFIG.host}:{MQTT_CONFIG.port}</Text>
        <View style={styles.topicsRow}>
          <View style={styles.topicChip}>
            <View style={[styles.topicDot, { backgroundColor: COLORS.accent }]} />
            <Text style={styles.topicText}>PUB: {MQTT_CONFIG.topicCmd}</Text>
          </View>
          <View style={styles.topicChip}>
            <View style={[styles.topicDot, { backgroundColor: COLORS.yellow }]} />
            <Text style={styles.topicText}>SUB: {MQTT_CONFIG.topicStatus}</Text>
          </View>
        </View>
      </View>

      {/* ── BOTÃO DE CONEXÃO ────────────────────────────── */}
      <TouchableOpacity
        onPress={conectar}
        style={[styles.connectBtn, {
          borderColor: connected ? COLORS.red : COLORS.accent,
          backgroundColor: connected
            ? "rgba(255,68,85,0.1)"
            : "rgba(0,212,255,0.08)",
        }]}
        disabled={connecting}
      >
        <Text style={[styles.connectBtnText, {
          color: connected ? COLORS.red : COLORS.accent,
        }]}>
          {connecting ? "AGUARDE..." : connected ? "DESCONECTAR" : "CONECTAR AO BROKER"}
        </Text>
      </TouchableOpacity>

      {/* ── BOTÕES LIGAR / DESLIGAR ─────────────────────── */}
      <View style={styles.buttonsRow}>
        {/* LIGAR */}
        <TouchableOpacity
          onPress={() => publicar("LIGAR")}
          disabled={!connected}
          style={[styles.ctrlBtn, styles.ctrlBtnOn, {
            opacity: connected ? 1 : 0.35,
            borderColor: deviceOn ? COLORS.green : COLORS.border,
          }]}
          activeOpacity={0.7}
        >
          <View style={[styles.ctrlIcon, {
            backgroundColor: deviceOn ? "rgba(0,255,156,0.15)" : "rgba(255,255,255,0.03)",
            borderColor: deviceOn ? COLORS.green : COLORS.border,
          }]}>
            <Text style={[styles.ctrlIconText, { color: deviceOn ? COLORS.green : COLORS.textMuted }]}>
              ⏻
            </Text>
          </View>
          <Text style={[styles.ctrlLabel, { color: deviceOn ? COLORS.green : COLORS.textMuted }]}>
            LIGAR
          </Text>
          {deviceOn && (
            <View style={styles.activeIndicator}>
              <Text style={styles.activeText}>● ATIVO</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* DESLIGAR */}
        <TouchableOpacity
          onPress={() => publicar("DESLIGAR")}
          disabled={!connected}
          style={[styles.ctrlBtn, styles.ctrlBtnOff, {
            opacity: connected ? 1 : 0.35,
            borderColor: !deviceOn && connected ? COLORS.red : COLORS.border,
          }]}
          activeOpacity={0.7}
        >
          <View style={[styles.ctrlIcon, {
            backgroundColor: !deviceOn && connected ? "rgba(255,68,85,0.12)" : "rgba(255,255,255,0.03)",
            borderColor: !deviceOn && connected ? COLORS.red : COLORS.border,
          }]}>
            <Text style={[styles.ctrlIconText, {
              color: !deviceOn && connected ? COLORS.red : COLORS.textMuted,
            }]}>
              ⏼
            </Text>
          </View>
          <Text style={[styles.ctrlLabel, {
            color: !deviceOn && connected ? COLORS.red : COLORS.textMuted,
          }]}>
            DESLIGAR
          </Text>
          {!deviceOn && connected && (
            <View style={[styles.activeIndicator, { borderColor: COLORS.red }]}>
              <Text style={[styles.activeText, { color: COLORS.red }]}>● INATIVO</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── STATUS DA ESP32 ─────────────────────────────── */}
      <Animated.View style={[styles.statusCard, { backgroundColor: statusBg, borderColor: glowBorder }]}>
        <Text style={styles.statusLabel}>RESPOSTA DA ESP32</Text>
        <Text style={styles.statusValue}>{lastStatus}</Text>
      </Animated.View>

      {/* ── LOG DE MENSAGENS ────────────────────────────── */}
      <View style={styles.logContainer}>
        <View style={styles.logHeader}>
          <Text style={styles.logTitle}>LOG DE COMUNICAÇÃO</Text>
          <TouchableOpacity onPress={() => setMessages([])}>
            <Text style={styles.logClear}>LIMPAR</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          ref={scrollRef}
          style={styles.logScroll}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 && (
            <Text style={styles.logEmpty}>Nenhuma mensagem ainda...</Text>
          )}
          {messages.map(m => (
            <View key={m.id} style={styles.logLine}>
              <Text style={styles.logTime}>{m.time}</Text>
              <Text style={[styles.logMsg, { color: logColor(m.type) }]}>
                {m.text}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// ── ESTILOS ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: Platform.OS === "android" ? 40 : 50,
    paddingHorizontal: 16,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  connBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
  },
  connDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // Card broker
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 15,
    color: COLORS.accent,
    fontWeight: "700",
    fontFamily: Platform.OS === "android" ? "monospace" : "Courier",
    marginBottom: 10,
  },
  topicsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  topicChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
  },
  topicDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  topicText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontFamily: Platform.OS === "android" ? "monospace" : "Courier",
  },

  // Botão conectar
  connectBtn: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 14,
  },
  connectBtnText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
  },

  // Botões LIGAR/DESLIGAR
  buttonsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  ctrlBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    gap: 8,
  },
  ctrlBtnOn:  {},
  ctrlBtnOff: {},
  ctrlIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlIconText: {
    fontSize: 28,
  },
  ctrlLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  activeIndicator: {
    borderWidth: 1,
    borderColor: COLORS.green,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activeText: {
    fontSize: 9,
    color: COLORS.green,
    fontWeight: "700",
    letterSpacing: 1,
  },

  // Status ESP32
  statusCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  statusLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: 6,
  },
  statusValue: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: "600",
    fontFamily: Platform.OS === "android" ? "monospace" : "Courier",
  },

  // Log
  logContainer: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  logTitle: {
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 2,
    fontWeight: "700",
  },
  logClear: {
    fontSize: 10,
    color: COLORS.red,
    fontWeight: "700",
    letterSpacing: 1,
  },
  logScroll: {
    flex: 1,
  },
  logEmpty: {
    color: COLORS.textDim,
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
    fontStyle: "italic",
  },
  logLine: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
    alignItems: "flex-start",
  },
  logTime: {
    fontSize: 10,
    color: COLORS.textDim,
    fontFamily: Platform.OS === "android" ? "monospace" : "Courier",
    marginTop: 1,
    minWidth: 60,
  },
  logMsg: {
    fontSize: 12,
    fontFamily: Platform.OS === "android" ? "monospace" : "Courier",
    flex: 1,
    flexWrap: "wrap",
  },
});
