# SAGE AI Widget - Client Integration Guide

## 📦 Installation

Add the following code snippet to your website's HTML (before closing `</body>` tag):

### Standard Installation (Recommended)

```html
<!-- SAGE AI Chatbot Integration - START -->
<div id="meliss-ai-bot" style="position: fixed; bottom: 25px; right: 25px; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <style>
    :root { --meliss-primary: linear-gradient(135deg, #14532d 0%, #22c55e 100%); }
    #meliss-btn:hover { transform: scale(1.08); box-shadow: 0 8px 25px rgba(34, 197, 94, 0.45); }
    #meliss-btn:active { transform: scale(0.95); }
  </style>
  <button id="meliss-btn" aria-label="Open Chat" style="width: 65px; height: 65px; border-radius: 50%; background: var(--meliss-primary); border: none; cursor: pointer; box-shadow: 0 5px 20px rgba(20, 83, 45, 0.3); display: flex; align-items: center; justify-content: center; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  </button>
  <div id="meliss-window" style="display: none; position: absolute; bottom: 85px; right: 0; width: 420px; height: 650px; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 60px rgba(0,0,0,0.2); background: white; border: 1px solid rgba(0,0,0,0.08); transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1); transform: translateY(20px); opacity: 0;">
    <iframe src="https://YOUR_CHATBOT_DOMAIN/widget.html?v=1.0.5" style="width: 100%; height: 100%; border: none;" title="SAGE AI Assistant"></iframe>
  </div>
</div>
<script>
(function() {
  const btn = document.getElementById('meliss-btn');
  const win = document.getElementById('meliss-window');
  let isOpen = false;
  
  function toggleWidget() {
    isOpen = !isOpen;
    if (isOpen) {
      win.style.display = 'block';
      setTimeout(() => { win.style.transform = 'translateY(0)'; win.style.opacity = '1'; }, 10);
      btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    } else {
      win.style.transform = 'translateY(20px)'; win.style.opacity = '0';
      setTimeout(() => { win.style.display = 'none'; }, 300);
      btn.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    }
  }
  
  btn.onclick = toggleWidget;
  
  window.addEventListener('message', (e) => {
    if (e.data === 'closeWidget' && isOpen) {
      toggleWidget();
    }
  });

  function checkMobile() {
    win.style.width = window.innerWidth < 480 ? 'calc(100vw - 40px)' : '420px';
    win.style.height = window.innerWidth < 480 ? 'calc(80vh)' : '650px';
    win.style.right = window.innerWidth < 480 ? '-10px' : '0';
  }
  window.addEventListener('resize', checkMobile); checkMobile();
})();
</script>
<!-- SAGE AI Chatbot Integration - END -->
```

## 🎨 Customization Options

You can customize the widget appearance by modifying these CSS variables:

### Color Customization

#### Green Theme (Default)
```css
background: linear-gradient(135deg, #14532d 0%, #22c55e 100%);
box-shadow: 0 4px 20px rgba(34, 197, 94, 0.35);
```

#### Custom Colors
To change the gradient colors, modify the button inline style:

```html
<button
  id="sage-btn"
  style="
    width: 65px;
    height: 65px;
    border-radius: 50%;
    background: linear-gradient(135deg, YOUR_COLOR_1 0%, YOUR_COLOR_2 100%);
    /* ... rest of styles ... */
  "
>
```

### Position Customization

**Bottom Right (Default)**
```css
position: fixed;
bottom: 25px;
right: 25px;
```

**Bottom Left**
```css
position: fixed;
bottom: 25px;
left: 25px;
```

**Top Right**
```css
position: fixed;
top: 25px;
right: 25px;
```

**Top Left**
```css
position: fixed;
top: 25px;
left: 25px;
```

### Size Customization

To make the button larger, modify the width and height:

```css
width: 80px;      /* Default: 65px */
height: 80px;     /* Default: 65px */
```

Adjust the SVG icon size accordingly:
```html
<svg width="40" height="40">  <!-- Adjust accordingly -->
```

## 🔧 Advanced Configuration

### With Custom API Endpoint

```html
<script>
  // If hosting on your own server
  window.MELISSA_CONFIG = {
    apiUrl: 'https://your-custom-domain.com/api',
    theme: 'dark',
    language: 'en'
  };
</script>
<script src="https://d4aiyhzmtitm8.cloudfront.net/sage-ai/embed.js"></script>
```

### With Authentication Token

```html
<script>
  window.MELISSA_AUTH = {
    token: 'YOUR_AUTH_TOKEN_HERE',
    userId: 'user_unique_id'
  };
</script>
<script src="https://d4aiyhzmtitm8.cloudfront.net/sage-ai/embed.js"></script>
```

## 📱 Responsive Behavior

The widget automatically scales and repositions on mobile devices:
- On screens smaller than 480px, the widget expands to fill the screen
- Touch-friendly sizing and spacing
- Optimized for all device sizes

## 🔒 Security

- The widget runs in an iframe for security isolation
- All communication goes through HTTPS
- No sensitive data is logged
- PCI DSS compliant

## 🧪 Testing

To test the widget integration:
1. Add the code to your website
2. Reload the page
3. Click the floating chat button
4. You should see the SAGE AI welcome message
5. Try sending a message to test functionality

## 🐛 Troubleshooting

### Widget Not Appearing
- Check browser console for JavaScript errors
- Ensure the CDN URL is accessible: `https://d4aiyhzmtitm8.cloudfront.net`
- Verify z-index is high enough (default: 999999)

### Messages Not Sending
- Check network tab in browser dev tools
- Verify API endpoint is configured correctly
- Check browser console for error messages

### Styling Issues
- Ensure no conflicting CSS on your page
- Check that inline styles are not being overridden
- Clear browser cache and reload

## 📞 Support

For integration issues or customization requests:
- Email: support@sageai.com
- Documentation: https://github.com/DigitalDada/SAGEAi#readme
- Issues: https://github.com/DigitalDada/SAGEAi/issues

## 📊 Analytics

Track widget usage with these events:
```javascript
// Widget opened
window.dispatchEvent(new Event('sage:opened'));

// Message sent
window.dispatchEvent(new Event('sage:message-sent'));

// Widget closed
window.dispatchEvent(new Event('sage:closed'));
```

---

**Version:** 2.0.0  
**Last Updated:** February 2026  
**Theme:** Green (Professional)
