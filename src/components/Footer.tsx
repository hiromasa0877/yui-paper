'use client';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-accent-dark text-white mt-12 border-t border-gray-700">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="font-bold text-accent-gold mb-3">結（ゆい）レセプション</h3>
            <p className="text-sm text-gray-400">
              デジタル技術を活用した葬儀受付サービス
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-3">主な機能</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• スマート参列登録</li>
              <li>• QRコード管理</li>
              <li>• 香典管理</li>
              <li>• リアルタイム統計</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-3">対応ブラウザ</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Chrome 90+</li>
              <li>• Safari 14+</li>
              <li>• Firefox 88+</li>
              <li>• Edge 90+</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <p className="text-sm text-gray-400">
              © {currentYear} 結（ゆい）レセプション. All rights reserved.
            </p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <a
                href="/"
                className="text-sm text-gray-400 hover:text-accent-gold transition-colors"
              >
                ホーム
              </a>
              <a
                href="/"
                className="text-sm text-gray-400 hover:text-accent-gold transition-colors"
              >
                プライバシーポリシー
              </a>
              <a
                href="/"
                className="text-sm text-gray-400 hover:text-accent-gold transition-colors"
              >
                利用規約
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
