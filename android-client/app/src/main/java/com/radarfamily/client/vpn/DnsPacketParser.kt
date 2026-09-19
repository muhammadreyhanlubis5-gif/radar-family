package com.radarfamily.client.vpn

data class ParsedPacket(
    val isValid: Boolean,
    val isDnsQuery: Boolean,
    val queryDomain: String,
    val transactionId: Int,
    val ipHeaderLength: Int,
    val sourceIp: ByteArray,
    val destIp: ByteArray,
    val sourcePort: Int,
    val destPort: Int,
    val dnsPayload: ByteArray,
    val dnsPayloadOffset: Int,
    val rawPacket: ByteArray,
    val totalLength: Int
)

object DnsPacketParser {
    fun parse(buffer: ByteArray, length: Int): ParsedPacket {
        if (length < 20) return invalidPacket(buffer, length)

        val versionAndIhl = buffer[0].toInt()
        val version = (versionAndIhl shr 4) and 0x0F
        if (version != 4) return invalidPacket(buffer, length)

        val ihl = versionAndIhl and 0x0F
        val ipHeaderLength = ihl * 4
        
        val protocol = buffer[9].toInt() and 0xFF
        if (protocol != 17) return invalidPacket(buffer, length) // Not UDP

        val sourceIp = buffer.copyOfRange(12, 16)
        val destIp = buffer.copyOfRange(16, 20)

        if (length < ipHeaderLength + 8) return invalidPacket(buffer, length)

        val sourcePort = ((buffer[ipHeaderLength].toInt() and 0xFF) shl 8) or (buffer[ipHeaderLength + 1].toInt() and 0xFF)
        val destPort = ((buffer[ipHeaderLength + 2].toInt() and 0xFF) shl 8) or (buffer[ipHeaderLength + 3].toInt() and 0xFF)
        
        val isDnsQuery = (destPort == 53)
        val dnsPayloadOffset = ipHeaderLength + 8
        val dnsPayloadLength = length - dnsPayloadOffset
        
        if (dnsPayloadLength < 12) return invalidPacket(buffer, length)
        
        val dnsPayload = buffer.copyOfRange(dnsPayloadOffset, length)
        
        var queryDomain = ""
        var transactionId = 0
        
        if (isDnsQuery) {
            transactionId = ((dnsPayload[0].toInt() and 0xFF) shl 8) or (dnsPayload[1].toInt() and 0xFF)
            queryDomain = extractDomain(dnsPayload, 12)
        }

        return ParsedPacket(
            isValid = true,
            isDnsQuery = isDnsQuery,
            queryDomain = queryDomain,
            transactionId = transactionId,
            ipHeaderLength = ipHeaderLength,
            sourceIp = sourceIp,
            destIp = destIp,
            sourcePort = sourcePort,
            destPort = destPort,
            dnsPayload = dnsPayload,
            dnsPayloadOffset = dnsPayloadOffset,
            rawPacket = buffer,
            totalLength = length
        )
    }

    private fun invalidPacket(buffer: ByteArray, length: Int) = ParsedPacket(
        false, false, "", 0, 0, ByteArray(0), ByteArray(0), 0, 0, ByteArray(0), 0, buffer, length
    )

    private fun extractDomain(dnsPayload: ByteArray, startOffset: Int): String {
        var offset = startOffset
        val domain = StringBuilder()
        var jumps = 0
        
        while (offset < dnsPayload.size && jumps < 10) {
            val len = dnsPayload[offset].toInt() and 0xFF
            if (len == 0) break
            
            if ((len and 0xC0) == 0xC0) {
                // Compression pointer
                if (offset + 1 >= dnsPayload.size) break
                val pointer = ((len and 0x3F) shl 8) or (dnsPayload[offset + 1].toInt() and 0xFF)
                offset = pointer
                jumps++
                continue
            }
            
            offset++
            for (i in 0 until len) {
                if (offset < dnsPayload.size) {
                    domain.append(dnsPayload[offset].toInt().toChar())
                    offset++
                }
            }
            domain.append(".")
        }
        
        if (domain.isNotEmpty() && domain.last() == '.') {
            domain.deleteCharAt(domain.length - 1)
        }
        return domain.toString()
    }

    fun buildBlockedResponse(originalPacket: ByteArray, originalLength: Int, parsed: ParsedPacket): ByteArray {
        val originalDns = parsed.dnsPayload
        // Answer: Name (C00C), Type A (0001), Class IN (0001), TTL 300 (0000012C), Len 4 (0004), IP 0.0.0.0
        val answer = byteArrayOf(
            0xC0.toByte(), 0x0C.toByte(), 
            0x00, 0x01, 
            0x00, 0x01, 
            0x00, 0x00, 0x01, 0x2C.toByte(), 
            0x00, 0x04, 
            0x00, 0x00, 0x00, 0x00
        )
        
        val questionSize = originalDns.size - 12
        val responseDns = ByteArray(12 + questionSize + answer.size)
        
        // Copy original header + question
        System.arraycopy(originalDns, 0, responseDns, 0, 12 + questionSize)
        
        // Set flags to Response (0x8180)
        responseDns[2] = 0x81.toByte()
        responseDns[3] = 0x80.toByte()
        
        // Set Answer Count to 1
        responseDns[6] = 0x00
        responseDns[7] = 0x01
        
        // Copy answer
        System.arraycopy(answer, 0, responseDns, 12 + questionSize, answer.size)
        
        return wrapInIpUdp(parsed, responseDns)
    }
    
    fun buildUpstreamResponse(originalPacket: ByteArray, parsed: ParsedPacket, upstreamResponse: ByteArray): ByteArray {
        upstreamResponse[0] = (parsed.transactionId shr 8).toByte()
        upstreamResponse[1] = (parsed.transactionId and 0xFF).toByte()
        return wrapInIpUdp(parsed, upstreamResponse)
    }
    
    private fun wrapInIpUdp(parsed: ParsedPacket, payload: ByteArray): ByteArray {
        val udpHeader = ByteArray(8)
        udpHeader[0] = (parsed.destPort shr 8).toByte()
        udpHeader[1] = (parsed.destPort and 0xFF).toByte()
        udpHeader[2] = (parsed.sourcePort shr 8).toByte()
        udpHeader[3] = (parsed.sourcePort and 0xFF).toByte()
        
        val udpLen = 8 + payload.size
        udpHeader[4] = (udpLen shr 8).toByte()
        udpHeader[5] = (udpLen and 0xFF).toByte()
        
        udpHeader[6] = 0
        udpHeader[7] = 0
        
        val ipHeaderLength = 20
        val totalLen = ipHeaderLength + udpLen
        val ipHeader = ByteArray(ipHeaderLength)
        
        ipHeader[0] = 0x45.toByte() // Version 4, IHL 5
        ipHeader[1] = 0x00 // TOS
        ipHeader[2] = (totalLen shr 8).toByte()
        ipHeader[3] = (totalLen and 0xFF).toByte()
        
        ipHeader[4] = 0x00; ipHeader[5] = 0x00
        ipHeader[6] = 0x40.toByte(); ipHeader[7] = 0x00 // DF set
        
        ipHeader[8] = 0x40.toByte() // TTL 64
        ipHeader[9] = 17 // UDP
        
        System.arraycopy(parsed.destIp, 0, ipHeader, 12, 4)
        System.arraycopy(parsed.sourceIp, 0, ipHeader, 16, 4)
        
        val ipChecksum = calculateIpChecksum(ipHeader, 0, ipHeaderLength)
        ipHeader[10] = (ipChecksum shr 8).toByte()
        ipHeader[11] = (ipChecksum and 0xFF).toByte()
        
        val finalPacket = ByteArray(totalLen)
        System.arraycopy(ipHeader, 0, finalPacket, 0, ipHeaderLength)
        System.arraycopy(udpHeader, 0, finalPacket, ipHeaderLength, 8)
        System.arraycopy(payload, 0, finalPacket, ipHeaderLength + 8, payload.size)
        
        return finalPacket
    }

    private fun calculateIpChecksum(header: ByteArray, offset: Int, length: Int): Int {
        var sum = 0
        var i = offset
        val end = offset + length
        
        while (i < end - 1) {
            sum += ((header[i].toInt() and 0xFF) shl 8) or (header[i+1].toInt() and 0xFF)
            i += 2
        }
        
        if (i < end) {
            sum += (header[i].toInt() and 0xFF) shl 8
        }
        
        while ((sum shr 16) > 0) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }
        
        return sum.inv() and 0xFFFF
    }
}
