import socket
import re
import struct
import threading

import sys

class Sniffer:
    def __init__(self):
        self.local_ip = self.get_local_ip()
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_IP)
        self.socket.bind((self.local_ip, 0))
        self.socket.setsockopt(socket.IPPROTO_IP, socket.IP_HDRINCL, 1)
        self.socket.ioctl(socket.SIO_RCVALL, socket.RCVALL_ON)
        self.filter = None
        if len(sys.argv) > 1:
            self.filter = sys.argv[1]
            print(f"Filter set from args: {self.filter}")
            sys.stdout.flush()

    def get_local_ip(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
        except Exception:
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip

    def get_protocol_name(self, protocol_num):
        protocols = {
            1: 'ICMP',
            2: 'IGMP',
            6: 'TCP',
            17: 'UDP'
        }
        return protocols.get(protocol_num, f'Unknown({protocol_num})')

    def get_high_level_protocol(self, protocol_num, src_port, dst_port):
        if protocol_num == 6:  # TCP
            if src_port == 80 or dst_port == 80:
                return 'HTTP'
            if src_port == 443 or dst_port == 443:
                return 'HTTP'
            return 'TCP'
        elif protocol_num == 17:  # UDP
            if src_port == 53 or dst_port == 53:
                return 'DNS'
            if src_port == 67 or dst_port == 67 or src_port == 68 or dst_port == 68:
                return 'DHCP'
            return 'UDP'
        elif protocol_num == 1:  # ICMP
            return 'ICMP'
        return self.get_protocol_name(protocol_num)

    def evaluate_filter(self, filter_str, src_ip, dst_ip, protocol):
        if not filter_str:
            return True
        # 支持缩写：src -> src_ip, dst -> dst_ip, proto -> protocol
        filter_str = filter_str.replace('src ', 'src_ip ').replace('dst ', 'dst_ip ').replace('proto ', 'protocol ')
        # 临时替换 =~ 以避免与 = 混淆
        filter_str = filter_str.replace('=~', '__MATCH__')
        # 将 = 替换为 == 用于相等比较
        filter_str = filter_str.replace('=', '==')
        # 恢复 =~
        filter_str = filter_str.replace('__MATCH__', '=~')
        # 为 == 后的无引号值添加引号
        filter_str = re.sub(r'==\s*([^\'"\s]+)', r"== '\1'", filter_str)
        # 将 =~ 替换为 MATCH
        filter_str = re.sub(r'(\w+)\s*=~\s*([^\'"\s]+|\'[^\']*\'|"[^"]*")', r'MATCH(\1, \2)', filter_str)
        # 定义 MATCH 函数
        def MATCH(var, pattern):
            if pattern.startswith("'") and pattern.endswith("'"):
                pattern = pattern[1:-1]
            elif pattern.startswith('"') and pattern.endswith('"'):
                pattern = pattern[1:-1]
            try:
                return bool(re.match(pattern, var))
            except:
                return False
        # eval 的局部变量
        locals_dict = {
            'src_ip': src_ip,
            'dst_ip': dst_ip,
            'protocol': protocol,
            'MATCH': MATCH,
            'and': lambda a, b: a and b,
            'or': lambda a, b: a or b,
            'not': lambda a: not a,
        }
        try:
            return eval(filter_str, {"__builtins__": {}}, locals_dict)
        except Exception as e:
            print(f"Filter evaluation error: {e}")
            return False

    def _sniff_loop(self):
        while True:
            try:
                packet = self.socket.recv(65565)
                if len(packet) < 20:
                    continue
                ip_header = packet[:20]
                version = (ip_header[0] >> 4) & 0xF
                if version != 4:
                    continue
                ihl = (ip_header[0] & 15) * 4
                if len(packet) < ihl:
                    continue
                protocol = ip_header[9]
                src_ip = socket.inet_ntoa(ip_header[12:16])
                dst_ip = socket.inet_ntoa(ip_header[16:20])
                src_port = dst_port = None
                if protocol == 6 or protocol == 17:  # TCP or UDP
                    if len(packet) >= ihl + 8:
                        tcp_udp_header = packet[ihl:ihl+8]
                        src_port, dst_port = struct.unpack('!HH', tcp_udp_header[:4])
                high_level_proto = self.get_high_level_protocol(protocol, src_port, dst_port)
                if self.evaluate_filter(self.filter, src_ip, dst_ip, high_level_proto):
                    print(f"Packet: src_ip={src_ip}, dst_ip={dst_ip}, protocol={high_level_proto}, length={len(packet)}, raw_data={packet.hex()}")
                    sys.stdout.flush()
            except OSError:
                break  # socket closed
            except Exception as e:
                print(f"Error: {e}")


    def set_filter(self, filter_str):
        # Test locals for validation
        test_locals = {
            'src_ip': '192.168.1.1',
            'dst_ip': '192.168.1.2',
            'protocol': 'TCP',
            'MATCH': lambda var, pattern: True,
            'and': lambda a, b: a and b,
            'or': lambda a, b: a or b,
            'not': lambda a: not a,
        }
        try:
            # Attempt to evaluate the filter with test values
            eval(filter_str, {"__builtins__": {}}, test_locals)
            self.filter = filter_str
            print(f"Filter set to: {filter_str}")
        except Exception as e:
            print(f"Invalid filter expression: {e}")
            print("Filter not set.")

    def run(self):
        print("Sniffer started.")
        sys.stdout.flush()
        self._sniff_loop()

if __name__ == "__main__":
    sniffer = Sniffer()
    sniffer.run()