$(document).ready(function() {
    $("#gallery").lightGallery({
      mode: "lg-fade",
      cssEasing: "ease",
      speed: 600,
      thumbnail: true,
      animateThumb: true,
      showThumbByDefault: true,
      download: false,
      loop: true,
      autoplay: false,
      zoom: true,
      hash: true,
      share: false,
      videoMaxWidth: "855px",
      autoplayControls: true,
      appendAutoplayControlsTo: ".lg-toolbar",
      controls: true,
      mousewheel: true,
      mobileSettings: {
        controls: false,
        showCloseIcon: true,
        download: false,
        hash: false,
        slideEndAnimatoin: true,
        enableSwipe: true
      }
    });
  });
  