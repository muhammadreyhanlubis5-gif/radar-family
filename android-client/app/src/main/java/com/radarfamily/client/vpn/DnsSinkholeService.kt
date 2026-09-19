package com.radarfamily.client.vpn

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import kotlin.concurrent.thread

class DnsSinkholeService : VpnService() {

    companion object {
        const val ACTION_START = "start"
        const val ACTION_STOP = "stop"
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "dns_sinkhole_channel"
    }

    private var vpnInterface: ParcelFileDescriptor? = null
    private var vpnThread: Thread? = null
    private var isRunning = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startVpn()
            ACTION_STOP -> stopVpn()
        }
        return START_STICKY
    }

    private fun startVpn() {
        if (isRunning) return
        createNotificationChannel()
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("RadarFamily DNS Sinkhole")
            .setContentText("Protecting your network")
            .setSmallIcon(android.R.drawable.ic_secure)
            .build()
        startForeground(NOTIFICATION_ID, notification)

        DomainBlocklist.initialize(this)
        
        val builder = Builder()
            .addAddress("10.0.0.2", 32)
            .addDnsServer("10.0.0.1")
            .addRoute("10.0.0.1", 32) // Route only DNS
            .setBlocking(true)
            .setSession("RadarFamily")

        for (app in DomainBlocklist.getWhitelistedApps()) {
            try {
                builder.addDisallowedApplication(app)
            } catch (e: Exception) {
                // Ignore uninstalled apps
            }
        }

        vpnInterface = builder.establish()
        isRunning = true
        broadcastState(true)

        vpnThread = thread { runVpnLoop() }
    }

    private fun stopVpn() {
        isRunning = false
        vpnThread?.interrupt()
        vpnInterface?.close()
        vpnInterface = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        broadcastState(false)
    }

    private fun broadcastState(active: Boolean) {
        sendBroadcast(Intent("com.radarfamily.client.VPN_STATE").apply {
            putExtra("active", active)
            setPackage(packageName)
        })
    }

    private fun runVpnLoop() {
        val fd = vpnInterface?.fileDescriptor ?: return
        val inputStream = FileInputStream(fd)
        val outputStream = FileOutputStream(fd)
        val buffer = ByteArray(32767)
        val udpSocket = DatagramSocket()
        protect(udpSocket) // bypass VPN

        while (isRunning && !Thread.interrupted()) {
            try {
                val length = inputStream.read(buffer)
                if (length > 0) {
                    val packet = buffer.copyOf(length)
                    val parsed = DnsPacketParser.parse(packet, length)
                    
                    if (parsed.isValid && parsed.isDnsQuery) {
                        if (DomainBlocklist.isBlocked(parsed.queryDomain)) {
                            // Blocked! Send spoofed response
                            val response = DnsPacketParser.buildBlockedResponse(packet, length, parsed)
                            outputStream.write(response)
                        } else {
                            // Safe! Forward to upstream
                            val upstreamIp = InetAddress.getByName(DomainBlocklist.getUpstreamDns())
                            val sendPacket = DatagramPacket(parsed.dnsPayload, parsed.dnsPayload.size, upstreamIp, 53)
                            udpSocket.send(sendPacket)
                            
                            // A real implementation would multiplex these, but for simplicity we block reading response
                            udpSocket.soTimeout = 2000
                            val recvBuffer = ByteArray(4096)
                            val recvPacket = DatagramPacket(recvBuffer, recvBuffer.size)
                            try {
                                udpSocket.receive(recvPacket)
                                val responseData = recvPacket.data.copyOf(recvPacket.length)
                                val responseIpUdp = DnsPacketParser.buildUpstreamResponse(packet, parsed, responseData)
                                outputStream.write(responseIpUdp)
                            } catch (e: Exception) {
                                // timeout or error
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                if (isRunning) e.printStackTrace()
            }
        }
        udpSocket.close()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "DNS Sinkhole", NotificationManager.IMPORTANCE_LOW)
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        stopVpn()
        super.onDestroy()
    }
}
